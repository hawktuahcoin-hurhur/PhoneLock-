import Foundation

enum SessionMode: Identifiable, Hashable {
    case topic(Topic)
    case satMix
    case dailyMix
    case mistakes

    var id: String {
        switch self {
        case .topic(let t): return "topic.\(t.id)"
        case .satMix: return "satMix"
        case .dailyMix: return "dailyMix"
        case .mistakes: return "mistakes"
        }
    }

    var title: String {
        switch self {
        case .topic(let t): return t.name
        case .satMix: return "SAT Sprint"
        case .dailyMix: return "Daily Mix"
        case .mistakes: return "Mistake Review"
        }
    }
}

/// Builds the questions for a study session.
@MainActor
enum QuestionEngine {
    static func build(_ mode: SessionMode, store: GameStore) async throws -> [Question] {
        let count = store.settings.sessionLength
        switch mode {
        case .topic(let topic):
            return try await questions(for: topic, count: count, store: store)

        case .satMix:
            return (0..<count).compactMap { _ in
                Catalog.satTopics.randomElement().flatMap { one(from: $0) }
            }

        case .dailyMix:
            // Weighted toward topics you've studied and are weakest in, plus a slice of SAT.
            let studied = store.progress.topics
                .filter { $0.value.answered > 0 }
                .sorted { $0.value.mastery < $1.value.mastery }
                .prefix(8)
                .compactMap { entry in Catalog.offlineTopics.first { $0.id == entry.key } }
            let pool = studied.isEmpty ? Catalog.offlineTopics : studied + Catalog.satTopics.shuffled().prefix(4)
            return (0..<count).compactMap { _ in pool.randomElement().flatMap { one(from: $0) } }

        case .mistakes:
            return Array(store.progress.mistakes.shuffled().prefix(count)).map { $0.reshuffled() }
        }
    }

    static func questions(for topic: Topic, count: Int, store: GameStore) async throws -> [Question] {
        switch topic.kind {
        case .ai(let name):
            var pool = store.progress.aiCache[topic.id] ?? []
            if pool.count < count {
                let recent = pool.map(\.prompt) + store.progress.mistakes.filter { $0.topicID == topic.id }.map(\.prompt)
                let fresh = try await AIService.generate(topicID: topic.id, topic: name, count: max(count, 15),
                                                         model: store.settings.aiModel, avoiding: recent)
                pool += fresh
            }
            let session = Array(pool.prefix(count))
            store.progress.aiCache[topic.id] = Array(pool.dropFirst(count))
            return session
        case .bank(let bank):
            var out: [Question] = []
            while out.count < count && !bank.isEmpty {
                out += bank.shuffled().prefix(count - out.count).map { $0.reshuffled() }
            }
            return out
        default:
            return (0..<count).compactMap { _ in one(from: topic) }
        }
    }

    /// One offline question from a topic (AI topics return nil).
    static func one(from topic: Topic) -> Question? {
        switch topic.kind {
        case .generator(let make):
            return make(topic.id)
        case .bank(let bank):
            return bank.randomElement()?.reshuffled()
        case .deck(let deck):
            return fromDeck(deck, topicID: topic.id)
        case .ai:
            return nil
        }
    }

    static func fromDeck(_ deck: Deck, topicID: String) -> Question? {
        guard let pair = deck.pairs.randomElement(), pair.count == 2 else { return nil }
        let useReverse = deck.reverse != nil && Bool.random()
        let (cue, answer, side) = useReverse ? (pair[1], pair[0], 0) : (pair[0], pair[1], 1)
        let template = useReverse ? deck.reverse! : deck.forward
        let distractors = deck.pairs.shuffled().compactMap { $0.count == 2 ? $0[side] : nil }.filter { $0 != answer }
        return Question.make(topicID: topicID, prompt: template.replacingOccurrences(of: "%@", with: cue),
                             answer: answer, distractors: distractors,
                             id: "\(topicID)|\(useReverse ? "r" : "f")|\(pair[0])")
    }
}

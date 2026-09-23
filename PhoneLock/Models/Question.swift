import Foundation

struct Question: Identifiable, Codable, Hashable {
    var id: String
    var topicID: String
    var prompt: String
    var choices: [String]
    var answerIndex: Int
    var explanation: String?

    var answer: String { choices[answerIndex] }

    /// Builds a question with the correct answer shuffled in among unique distractors.
    static func make(topicID: String, prompt: String, answer: String, distractors: [String],
                     explanation: String? = nil, id: String? = nil) -> Question {
        var seen: Set<String> = [answer]
        var wrong: [String] = []
        for d in distractors where !seen.contains(d) {
            seen.insert(d)
            wrong.append(d)
            if wrong.count == 3 { break }
        }
        var choices = wrong + [answer]
        choices.shuffle()
        return Question(
            id: id ?? "\(topicID)|\(prompt)",
            topicID: topicID,
            prompt: prompt,
            choices: choices,
            answerIndex: choices.firstIndex(of: answer) ?? 0,
            explanation: explanation
        )
    }

    /// Returns the same question with its choices in a fresh random order.
    func reshuffled() -> Question {
        let correct = answer
        var q = self
        q.choices.shuffle()
        q.answerIndex = q.choices.firstIndex(of: correct) ?? 0
        return q
    }
}

enum Subject: String, CaseIterable, Codable, Identifiable {
    case satMath = "SAT Math"
    case satReading = "SAT Reading & Writing"
    case vocab = "Vocabulary"
    case math = "Math"
    case science = "Science"
    case history = "History & Civics"
    case geography = "Geography"
    case languages = "Languages"
    case humanities = "Arts & Humanities"
    case tech = "Computer Science"
    case social = "Social Sciences"
    case business = "Business & Econ"
    case custom = "My Decks"

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .satMath: return "function"
        case .satReading: return "text.book.closed.fill"
        case .vocab: return "character.book.closed.fill"
        case .math: return "x.squareroot"
        case .science: return "atom"
        case .history: return "building.columns.fill"
        case .geography: return "globe.americas.fill"
        case .languages: return "bubble.left.and.bubble.right.fill"
        case .humanities: return "paintpalette.fill"
        case .tech: return "cpu.fill"
        case .social: return "person.3.fill"
        case .business: return "chart.line.uptrend.xyaxis"
        case .custom: return "square.stack.3d.up.fill"
        }
    }

    var isSAT: Bool { self == .satMath || self == .satReading }
}

/// A flashcard deck: pairs are turned into multiple-choice questions in both directions.
struct Deck: Codable, Hashable {
    /// e.g. "What is the capital of %@?"
    var forward: String
    /// e.g. "%@ is the capital of which country?" — nil disables reverse questions.
    var reverse: String?
    var pairs: [[String]]
}

struct Topic: Identifiable {
    enum Kind {
        case generator((String) -> Question)
        case bank([Question])
        case deck(Deck)
        case ai(String)
    }

    let id: String
    let name: String
    let subject: Subject
    let kind: Kind

    var isSAT: Bool { subject.isSAT || id.hasPrefix("sat.") }

    var isAI: Bool {
        if case .ai = kind { return true }
        return false
    }

    var badge: String {
        switch kind {
        case .generator: return "∞ questions"
        case .bank(let qs): return "\(qs.count) questions"
        case .deck(let d): return "\(d.pairs.count) cards"
        case .ai: return "AI generated"
        }
    }
}

extension Topic: Hashable {
    static func == (lhs: Topic, rhs: Topic) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

struct CustomDeck: Codable, Identifiable, Hashable {
    var id: String = UUID().uuidString
    var name: String
    var pairs: [[String]]
}

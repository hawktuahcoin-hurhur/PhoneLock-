import Foundation

/// Every study topic in the app, built once at launch.
enum Catalog {
    static let builtIn: [Topic] = {
        var topics: [Topic] = []
        for (id, name, make) in MathGenerators.satMath {
            topics.append(Topic(id: id, name: name, subject: .satMath, kind: .generator(make)))
        }
        for (id, name, questions) in SATReadingWriting.topics {
            topics.append(Topic(id: id, name: name, subject: .satReading, kind: .bank(questions)))
        }
        for (id, name, make) in MathGenerators.general {
            topics.append(Topic(id: id, name: name, subject: .math, kind: .generator(make)))
        }
        for (id, name, subject, deck) in Decks.all {
            topics.append(Topic(id: id, name: name, subject: subject, kind: .deck(deck)))
        }
        for (subject, names) in AITopics.catalog {
            for name in names {
                topics.append(Topic(id: aiID(name), name: name, subject: subject, kind: .ai(name)))
            }
        }
        return topics
    }()

    static func aiID(_ name: String) -> String {
        "ai." + name.lowercased().map { $0.isLetter || $0.isNumber ? String($0) : "-" }.joined()
    }

    static func customTopics(_ decks: [CustomDeck]) -> [Topic] {
        decks.map {
            Topic(id: "custom.\($0.id)", name: $0.name, subject: .custom,
                  kind: .deck(Deck(forward: "%@", reverse: "Which term matches: %@", pairs: $0.pairs)))
        }
    }

    static func customAITopic(_ name: String) -> Topic {
        Topic(id: aiID(name), name: name, subject: .custom, kind: .ai(name))
    }

    static var satTopics: [Topic] { builtIn.filter { $0.isSAT && !$0.isAI } }
    static var offlineTopics: [Topic] { builtIn.filter { !$0.isAI } }
}

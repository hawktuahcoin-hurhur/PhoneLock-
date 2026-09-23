import Foundation

struct TopicStat: Codable, Hashable {
    var answered = 0
    var correct = 0

    var accuracy: Double { answered == 0 ? 0 : Double(correct) / Double(answered) }

    /// 0...1 mastery that needs both volume and accuracy.
    var mastery: Double { min(1, Double(correct) / 40) * (0.4 + 0.6 * accuracy) }
}

struct DayLog: Codable, Hashable {
    var correct = 0
    var satCorrect = 0
    var answered = 0
    var xp = 0
    var goalMet = false
}

struct StudySettings: Codable, Hashable {
    var dailyGoal = 30
    var satMinimum = 10
    var strictMode = false
    var sessionLength = 10
    var passMinutes = 15
    var passCost = 60
    var aiModel = "claude-opus-5"
}

struct GameProgress: Codable {
    var onboarded = false
    var xp = 0
    var coins = 0
    var streak = 0
    var bestStreak = 0
    var streakFreezes = 0
    var lastGoalDay: String?
    var totalAnswered = 0
    var totalCorrect = 0
    var bestCombo = 0
    var perfectSessions = 0
    var passesUsed = 0
    var days: [String: DayLog] = [:]
    var topics: [String: TopicStat] = [:]
    var mistakes: [Question] = []
    var unlocked: Set<String> = []
    var customDecks: [CustomDeck] = []
    var customAITopics: [String] = []
    var aiCache: [String: [Question]] = [:]
    var settings = StudySettings()

    var today: DayLog {
        get { days[DayKey.string()] ?? DayLog() }
        set { days[DayKey.string()] = newValue }
    }
}

enum Leveling {
    /// Total XP required to reach `level` (level 1 starts at 0).
    static func xpFor(level: Int) -> Int { 50 * (level - 1) * level }

    static func level(for xp: Int) -> Int {
        var l = 1
        while xpFor(level: l + 1) <= xp { l += 1 }
        return l
    }

    static func progress(for xp: Int) -> (level: Int, into: Int, needed: Int) {
        let l = level(for: xp)
        let base = xpFor(level: l)
        return (l, xp - base, xpFor(level: l + 1) - base)
    }

    static func title(for level: Int) -> String {
        switch level {
        case ..<3: return "Rookie"
        case ..<6: return "Apprentice"
        case ..<10: return "Scholar"
        case ..<15: return "Honor Roll"
        case ..<20: return "Valedictorian"
        case ..<30: return "Professor"
        case ..<45: return "Sage"
        default: return "1600 Legend"
        }
    }
}

// Tolerant decoding: fields added in future versions fall back to defaults instead of wiping saved progress.
extension KeyedDecodingContainer {
    func value<T: Decodable>(_ key: Key, _ fallback: T) -> T {
        (try? decodeIfPresent(T.self, forKey: key)) ?? fallback
    }
}

extension GameProgress {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let d = GameProgress()
        self.init()
        onboarded = c.value(.onboarded, d.onboarded)
        xp = c.value(.xp, d.xp)
        coins = c.value(.coins, d.coins)
        streak = c.value(.streak, d.streak)
        bestStreak = c.value(.bestStreak, d.bestStreak)
        streakFreezes = c.value(.streakFreezes, d.streakFreezes)
        lastGoalDay = c.value(.lastGoalDay, d.lastGoalDay)
        totalAnswered = c.value(.totalAnswered, d.totalAnswered)
        totalCorrect = c.value(.totalCorrect, d.totalCorrect)
        bestCombo = c.value(.bestCombo, d.bestCombo)
        perfectSessions = c.value(.perfectSessions, d.perfectSessions)
        passesUsed = c.value(.passesUsed, d.passesUsed)
        days = c.value(.days, d.days)
        topics = c.value(.topics, d.topics)
        mistakes = c.value(.mistakes, d.mistakes)
        unlocked = c.value(.unlocked, d.unlocked)
        customDecks = c.value(.customDecks, d.customDecks)
        customAITopics = c.value(.customAITopics, d.customAITopics)
        aiCache = c.value(.aiCache, d.aiCache)
        settings = c.value(.settings, d.settings)
    }
}

extension StudySettings {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let d = StudySettings()
        self.init()
        dailyGoal = c.value(.dailyGoal, d.dailyGoal)
        satMinimum = c.value(.satMinimum, d.satMinimum)
        strictMode = c.value(.strictMode, d.strictMode)
        sessionLength = c.value(.sessionLength, d.sessionLength)
        passMinutes = c.value(.passMinutes, d.passMinutes)
        passCost = c.value(.passCost, d.passCost)
        aiModel = c.value(.aiModel, d.aiModel)
    }
}

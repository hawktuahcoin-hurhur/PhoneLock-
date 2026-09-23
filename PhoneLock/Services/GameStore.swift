import Foundation
import SwiftUI

enum GameEvent: Identifiable, Equatable {
    case levelUp(Int)
    case achievement(String)
    case goalComplete

    var id: String {
        switch self {
        case .levelUp(let l): return "level\(l)"
        case .achievement(let a): return "ach\(a)"
        case .goalComplete: return "goal"
        }
    }
}

/// Owns all game state: XP, coins, streaks, the daily goal, and keeps the app lock in sync with it.
@MainActor
final class GameStore: ObservableObject {
    @Published var progress: GameProgress { didSet { save() } }
    @Published var events: [GameEvent] = []
    @Published var quizActive = false

    private static let storageKey = "game.progress.v1"

    init() {
        if let data = AppGroup.defaults.data(forKey: Self.storageKey),
           let saved = try? JSONDecoder().decode(GameProgress.self, from: data) {
            progress = saved
        } else {
            progress = GameProgress()
        }
        syncLock()
    }

    private func save() {
        if let data = try? JSONEncoder().encode(progress) {
            AppGroup.defaults.set(data, forKey: Self.storageKey)
        }
    }

    // MARK: Derived state

    var settings: StudySettings { progress.settings }
    var today: DayLog { progress.today }
    var goalMet: Bool { today.goalMet }
    var level: Int { Leveling.level(for: progress.xp) }

    var remainingCorrect: Int { max(0, settings.dailyGoal - today.correct) }
    var remainingSAT: Int { max(0, settings.satMinimum - today.satCorrect) }

    var goalFraction: Double {
        let need = Double(settings.dailyGoal + settings.satMinimum)
        guard need > 0 else { return 1 }
        let have = Double(min(today.correct, settings.dailyGoal) + min(today.satCorrect, settings.satMinimum))
        return min(1, have / need)
    }

    /// Streak as it stands right now — drops to 0 if a day was missed and no freeze covers it.
    var currentStreak: Int {
        guard let last = progress.lastGoalDay, let gap = Self.daysBetween(last, DayKey.string()) else { return 0 }
        if gap <= 1 { return progress.streak }
        return gap - 1 <= progress.streakFreezes ? progress.streak : 0
    }

    var remainingText: String {
        if goalMet { return "Goal complete — apps unlocked. 🎉" }
        var parts: [String] = []
        if remainingCorrect > 0 { parts.append("\(remainingCorrect) more correct answers") }
        if remainingSAT > 0 { parts.append("\(remainingSAT) more SAT answers") }
        return "Still needed today: " + parts.joined(separator: " and ") + "."
    }

    // MARK: Answering

    /// Records an answer and returns the XP earned.
    @discardableResult
    func record(_ question: Question, topic: Topic?, correct: Bool, combo: Int) -> Int {
        let oldLevel = level
        let isSAT = topic?.isSAT ?? question.topicID.hasPrefix("sat.")
        var p = progress
        var day = p.today
        var stat = p.topics[question.topicID] ?? TopicStat()

        p.totalAnswered += 1
        day.answered += 1
        stat.answered += 1
        var xp = 0

        if correct {
            xp = 10 + min(combo, 10)
            if isSAT { xp = xp * 3 / 2 }
            p.totalCorrect += 1
            p.coins += 1
            day.correct += 1
            if isSAT { day.satCorrect += 1 }
            stat.correct += 1
            p.bestCombo = max(p.bestCombo, combo)
            p.mistakes.removeAll { $0.id == question.id }
        } else {
            if settings.strictMode && day.correct > 0 { day.correct -= 1 }
            if !p.mistakes.contains(where: { $0.id == question.id }) {
                p.mistakes.append(question)
                if p.mistakes.count > 150 { p.mistakes.removeFirst(p.mistakes.count - 150) }
            }
        }

        p.xp += xp
        day.xp += xp
        p.topics[question.topicID] = stat
        p.today = day
        progress = p

        if level > oldLevel {
            progress.coins += 20 * level
            events.append(.levelUp(level))
        }
        checkGoal()
        checkAchievements()
        return xp
    }

    func finishSession(correct: Int, total: Int) {
        if total >= 5 && correct == total { progress.perfectSessions += 1 }
        checkAchievements()
    }

    func checkGoal() {
        defer { syncLock() }
        guard !today.goalMet, remainingCorrect == 0, remainingSAT == 0 else { return }
        var p = progress
        let todayKey = DayKey.string()
        if let last = p.lastGoalDay, let gap = Self.daysBetween(last, todayKey) {
            let missed = gap - 1
            if missed <= 0 {
                p.streak += 1
            } else if missed <= p.streakFreezes {
                p.streakFreezes -= missed
                p.streak += 1
            } else {
                p.streak = 1
            }
        } else {
            p.streak = 1
        }
        p.bestStreak = max(p.bestStreak, p.streak)
        p.lastGoalDay = todayKey
        p.coins += 25 + min(p.streak, 30)
        var day = p.today
        day.goalMet = true
        p.today = day
        progress = p
        events.append(.goalComplete)
    }

    private func checkAchievements() {
        for a in Achievements.all where !progress.unlocked.contains(a.id) && a.isEarned(progress) {
            progress.unlocked.insert(a.id)
            progress.coins += a.reward
            events.append(.achievement(a.id))
        }
    }

    // MARK: Shop

    func buyPass(lock: LockManager) -> Bool {
        guard progress.coins >= settings.passCost, !goalMet else { return false }
        progress.coins -= settings.passCost
        progress.passesUsed += 1
        lock.startPass(minutes: settings.passMinutes)
        return true
    }

    static let freezeCost = 150

    func buyFreeze() -> Bool {
        guard progress.coins >= Self.freezeCost, progress.streakFreezes < 3 else { return false }
        progress.coins -= Self.freezeCost
        progress.streakFreezes += 1
        return true
    }

    func updateSettings(_ change: (inout StudySettings) -> Void) {
        change(&progress.settings)
        checkGoal()
    }

    func resetProgress() {
        var fresh = GameProgress()
        fresh.onboarded = true
        fresh.settings = progress.settings
        fresh.customDecks = progress.customDecks
        fresh.customAITopics = progress.customAITopics
        progress = fresh
        syncLock()
    }

    // MARK: Lock

    /// Publishes today's status to the shared container and re-applies the shield rules.
    func syncLock() {
        let defaults = AppGroup.defaults
        if today.goalMet {
            defaults.set(DayKey.string(), forKey: SharedKey.goalMetDay)
        }
        LockEngine.remainingText = remainingText
        LockEngine.refresh()
        objectWillChange.send()
    }

    // MARK: Dates

    private static let dayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static func date(from key: String) -> Date? { dayFormatter.date(from: key) }

    static func daysBetween(_ a: String, _ b: String) -> Int? {
        guard let da = date(from: a), let db = date(from: b) else { return nil }
        return Calendar.current.dateComponents([.day], from: da, to: db).day
    }
}

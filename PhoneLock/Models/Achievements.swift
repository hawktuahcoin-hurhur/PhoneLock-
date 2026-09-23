import Foundation

struct Achievement: Identifiable {
    let id: String
    let title: String
    let detail: String
    let icon: String
    let reward: Int
    let isEarned: (GameProgress) -> Bool
}

enum Achievements {
    static let all: [Achievement] = [
        Achievement(id: "first", title: "First Steps", detail: "Answer your first question", icon: "figure.walk", reward: 10) { $0.totalAnswered >= 1 },
        Achievement(id: "c100", title: "Century", detail: "100 correct answers", icon: "100.circle.fill", reward: 50) { $0.totalCorrect >= 100 },
        Achievement(id: "c1000", title: "Grinder", detail: "1,000 correct answers", icon: "flame.circle.fill", reward: 200) { $0.totalCorrect >= 1000 },
        Achievement(id: "c5000", title: "Unstoppable", detail: "5,000 correct answers", icon: "bolt.circle.fill", reward: 500) { $0.totalCorrect >= 5000 },
        Achievement(id: "goal1", title: "Unlocked", detail: "Hit your daily goal", icon: "lock.open.fill", reward: 25) { $0.days.values.contains { $0.goalMet } },
        Achievement(id: "s3", title: "Hat Trick", detail: "3-day streak", icon: "3.circle.fill", reward: 30) { $0.bestStreak >= 3 },
        Achievement(id: "s7", title: "Week Warrior", detail: "7-day streak", icon: "calendar", reward: 75) { $0.bestStreak >= 7 },
        Achievement(id: "s30", title: "Iron Will", detail: "30-day streak", icon: "shield.lefthalf.filled", reward: 300) { $0.bestStreak >= 30 },
        Achievement(id: "s100", title: "Centurion", detail: "100-day streak", icon: "crown.fill", reward: 1000) { $0.bestStreak >= 100 },
        Achievement(id: "combo10", title: "On Fire", detail: "10-answer combo", icon: "flame.fill", reward: 40) { $0.bestCombo >= 10 },
        Achievement(id: "combo25", title: "Blazing", detail: "25-answer combo", icon: "sparkles", reward: 120) { $0.bestCombo >= 25 },
        Achievement(id: "perfect", title: "Flawless", detail: "Perfect study session", icon: "star.circle.fill", reward: 40) { $0.perfectSessions >= 1 },
        Achievement(id: "perfect10", title: "Precision", detail: "10 perfect sessions", icon: "scope", reward: 150) { $0.perfectSessions >= 10 },
        Achievement(id: "topics10", title: "Explorer", detail: "Study 10 different topics", icon: "map.fill", reward: 60) { $0.topics.count >= 10 },
        Achievement(id: "topics50", title: "Polymath", detail: "Study 50 different topics", icon: "globe", reward: 250) { $0.topics.count >= 50 },
        Achievement(id: "master", title: "Master", detail: "Fully master a topic", icon: "graduationcap.fill", reward: 100) { $0.topics.values.contains { $0.mastery >= 0.99 } },
        Achievement(id: "sat500", title: "SAT Ready", detail: "500 correct SAT answers", icon: "pencil.and.ruler.fill", reward: 250) { p in
            p.days.values.reduce(0) { $0 + $1.satCorrect } >= 500
        },
        Achievement(id: "lvl10", title: "Double Digits", detail: "Reach level 10", icon: "10.circle.fill", reward: 100) { Leveling.level(for: $0.xp) >= 10 },
        Achievement(id: "nopass", title: "No Excuses", detail: "Hit a 14-day streak without a pass", icon: "hand.raised.fill", reward: 150) { $0.bestStreak >= 14 && $0.passesUsed == 0 },
    ]
}

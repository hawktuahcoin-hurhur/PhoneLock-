import SwiftUI

struct TrophiesView: View {
    @EnvironmentObject var store: GameStore

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    levelCard
                    stats
                    heatmap
                    achievements
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
            .scrollIndicators(.hidden)
            .background(AppBackground())
            .navigationTitle("Trophies")
        }
    }

    private var levelCard: some View {
        let lp = Leveling.progress(for: store.progress.xp)
        return HStack(spacing: 18) {
            ZStack {
                ProgressRing(progress: Double(lp.into) / Double(max(1, lp.needed)), lineWidth: 10)
                    .frame(width: 86, height: 86)
                Text("\(lp.level)").font(.rounded(34, .heavy))
            }
            VStack(alignment: .leading, spacing: 6) {
                Text(Leveling.title(for: lp.level)).font(.rounded(24, .heavy))
                Text("\(store.progress.xp) total XP").font(.rounded(14)).foregroundStyle(Theme.dim)
                Text("\(lp.needed - lp.into) XP to level \(lp.level + 1)").font(.rounded(14, .semibold)).foregroundStyle(Theme.cyan)
            }
            Spacer()
        }
        .glassCard()
    }

    private var stats: some View {
        let p = store.progress
        let accuracy = p.totalAnswered == 0 ? 0 : Int(Double(p.totalCorrect) / Double(p.totalAnswered) * 100)
        let cols = [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())]
        return LazyVGrid(columns: cols, spacing: 12) {
            stat("\(store.currentStreak)", "streak", "flame.fill", Theme.gold)
            stat("\(p.bestStreak)", "best streak", "crown.fill", Theme.pink)
            stat("\(p.streakFreezes)", "freezes", "snowflake", Theme.cyan)
            stat("\(p.totalCorrect)", "correct", "checkmark.seal.fill", Theme.mint)
            stat("\(accuracy)%", "accuracy", "scope", Theme.violet)
            stat("\(p.bestCombo)", "best combo", "bolt.fill", Theme.gold)
        }
    }

    private func stat(_ value: String, _ label: String, _ icon: String, _ color: Color) -> some View {
        VStack(spacing: 6) {
            Image(systemName: icon).foregroundStyle(color)
            Text(value).font(.rounded(22, .heavy)).monospacedDigit().minimumScaleFactor(0.6).lineLimit(1)
            Text(label).font(.rounded(12)).foregroundStyle(Theme.dim)
        }
        .frame(maxWidth: .infinity)
        .glassCard(padding: 12)
    }

    /// GitHub-style grid of the last 15 weeks.
    private var heatmap: some View {
        let weeks = 15
        let cal = Calendar.current
        let today = Date()
        let weekday = cal.component(.weekday, from: today) - 1
        let start = cal.date(byAdding: .day, value: -(weeks * 7 - 1 - (6 - weekday)), to: today) ?? today
        return VStack(alignment: .leading, spacing: 10) {
            SectionHeader(title: "Study history")
            HStack(alignment: .top, spacing: 4) {
                ForEach(0..<weeks, id: \.self) { w in
                    VStack(spacing: 4) {
                        ForEach(0..<7, id: \.self) { d in
                            let date = cal.date(byAdding: .day, value: w * 7 + d, to: start) ?? today
                            let log = store.progress.days[DayKey.string(for: date)]
                            RoundedRectangle(cornerRadius: 4, style: .continuous)
                                .fill(color(for: log, future: date > today))
                                .aspectRatio(1, contentMode: .fit)
                        }
                    }
                }
            }
            HStack(spacing: 6) {
                Text("Less").font(.rounded(11)).foregroundStyle(Theme.dim)
                ForEach([0.08, 0.3, 0.6, 1.0], id: \.self) { o in
                    RoundedRectangle(cornerRadius: 3).fill(o < 0.1 ? Color.white.opacity(o) : Theme.violet.opacity(o)).frame(width: 12, height: 12)
                }
                Text("More").font(.rounded(11)).foregroundStyle(Theme.dim)
                Spacer()
                RoundedRectangle(cornerRadius: 3).fill(Theme.gold).frame(width: 12, height: 12)
                Text("Goal met").font(.rounded(11)).foregroundStyle(Theme.dim)
            }
        }
        .glassCard()
    }

    private func color(for log: DayLog?, future: Bool) -> Color {
        if future { return .clear }
        guard let log, log.correct > 0 else { return Color.white.opacity(0.08) }
        if log.goalMet { return Theme.gold }
        let f = min(1, Double(log.correct) / Double(max(1, store.settings.dailyGoal)))
        return Theme.violet.opacity(0.25 + 0.75 * f)
    }

    private var achievements: some View {
        let cols = [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())]
        return VStack(spacing: 12) {
            SectionHeader(title: "Achievements · \(store.progress.unlocked.count)/\(Achievements.all.count)")
            LazyVGrid(columns: cols, spacing: 12) {
                ForEach(Achievements.all) { a in
                    let earned = store.progress.unlocked.contains(a.id)
                    VStack(spacing: 8) {
                        ZStack {
                            Circle()
                                .fill(earned ? AnyShapeStyle(Theme.fire) : AnyShapeStyle(Color.white.opacity(0.06)))
                                .frame(width: 58, height: 58)
                                .shadow(color: earned ? Theme.gold.opacity(0.5) : .clear, radius: 10)
                            Image(systemName: earned ? a.icon : "lock.fill")
                                .font(.system(size: 22, weight: .bold))
                                .foregroundStyle(earned ? .white : Theme.dim)
                        }
                        Text(a.title).font(.rounded(13, .bold)).lineLimit(1).minimumScaleFactor(0.8)
                        Text(a.detail).font(.rounded(10)).foregroundStyle(Theme.dim).multilineTextAlignment(.center).lineLimit(2)
                    }
                    .frame(maxWidth: .infinity, minHeight: 140, alignment: .top)
                    .glassCard(padding: 10)
                    .opacity(earned ? 1 : 0.7)
                }
            }
        }
    }
}

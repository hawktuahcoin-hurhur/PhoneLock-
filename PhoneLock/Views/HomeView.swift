import SwiftUI

struct HomeView: View {
    @EnvironmentObject var store: GameStore
    @EnvironmentObject var lock: LockManager
    @Binding var tab: Int
    @State private var session: SessionMode?
    @State private var confirmPass = false
    @State private var now = Date()
    private let ticker = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    header
                    goalCard
                    lockCard
                    quickStart
                    weekStrip
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
            .scrollIndicators(.hidden)
            .background(AppBackground())
            .toolbar(.hidden, for: .navigationBar)
        }
        .fullScreenCover(item: $session) { mode in
            QuizView(mode: mode)
        }
        .onReceive(ticker) { t in
            now = t
            if let until = LockEngine.passUntil, until <= t {
                LockEngine.passUntil = nil
                store.syncLock()
            }
        }
    }

    // MARK: Header

    private var header: some View {
        let lp = Leveling.progress(for: store.progress.xp)
        return VStack(spacing: 14) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(greeting).font(.rounded(15)).foregroundStyle(Theme.dim)
                    Text("Level \(lp.level) · \(Leveling.title(for: lp.level))").font(.rounded(24, .heavy))
                }
                Spacer()
                StatPill(icon: "flame.fill", value: "\(store.currentStreak)", tint: Theme.gold)
                StatPill(icon: "circle.hexagongrid.fill", value: "\(store.progress.coins)", tint: Theme.cyan)
            }
            VStack(spacing: 6) {
                Bar(value: Double(lp.into) / Double(max(1, lp.needed)), color: Theme.violet, height: 10)
                HStack {
                    Text("\(lp.into) / \(lp.needed) XP").font(.rounded(12, .semibold)).foregroundStyle(Theme.dim)
                    Spacer()
                    Text("\(store.today.xp) XP today").font(.rounded(12, .semibold)).foregroundStyle(Theme.dim)
                }
            }
        }
        .padding(.top, 8)
    }

    private var greeting: String {
        let h = Calendar.current.component(.hour, from: now)
        return h < 12 ? "Good morning" : (h < 18 ? "Good afternoon" : "Good evening")
    }

    // MARK: Goal

    private var goalCard: some View {
        let s = store.settings, d = store.today
        return VStack(spacing: 18) {
            ZStack {
                ProgressRing(progress: store.goalFraction, lineWidth: 20)
                    .frame(width: 190, height: 190)
                VStack(spacing: 2) {
                    Image(systemName: store.goalMet ? "lock.open.fill" : "lock.fill")
                        .font(.system(size: 26, weight: .bold))
                        .foregroundStyle(store.goalMet ? AnyShapeStyle(Theme.success) : AnyShapeStyle(Theme.accent))
                    Text("\(min(d.correct, s.dailyGoal))").font(.rounded(46, .heavy)).monospacedDigit()
                    Text("of \(s.dailyGoal) correct").font(.rounded(13, .semibold)).foregroundStyle(Theme.dim)
                }
            }
            .padding(.top, 6)

            if s.satMinimum > 0 {
                VStack(spacing: 6) {
                    HStack {
                        Label("SAT requirement", systemImage: "pencil.and.ruler.fill").font(.rounded(14, .semibold))
                        Spacer()
                        Text("\(min(d.satCorrect, s.satMinimum))/\(s.satMinimum)").font(.rounded(14, .bold)).monospacedDigit()
                    }
                    Bar(value: Double(d.satCorrect) / Double(s.satMinimum), color: Theme.pink)
                }
            }

            Text(store.goalMet ? "You're free for today. Keep going for bonus XP 🔥" : store.remainingText)
                .font(.rounded(14)).foregroundStyle(Theme.dim).multilineTextAlignment(.center)

            Button {
                Haptics.tap()
                session = .dailyMix
            } label: {
                Label(store.goalMet ? "Keep the streak hot" : "Continue studying", systemImage: "play.fill")
            }
            .buttonStyle(PrimaryButtonStyle())
        }
        .glassCard()
    }

    // MARK: Lock

    private var lockCard: some View {
        HStack(spacing: 14) {
            ZStack {
                Circle().fill(lock.isLocked ? Theme.danger.opacity(0.18) : Theme.mint.opacity(0.18)).frame(width: 48, height: 48)
                Image(systemName: lock.isLocked ? "lock.fill" : "lock.open.fill")
                    .foregroundStyle(lock.isLocked ? Theme.danger : Theme.mint)
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(lockTitle).font(.rounded(16, .bold))
                Text(lockSubtitle).font(.rounded(13)).foregroundStyle(Theme.dim)
            }
            Spacer()
            if lock.isLocked {
                Button {
                    confirmPass = true
                } label: {
                    Text("Pass").font(.rounded(14, .bold))
                        .padding(.horizontal, 14).padding(.vertical, 8)
                        .background(Color.white.opacity(0.1), in: Capsule())
                }
                .buttonStyle(PressableStyle())
            } else if lock.lockedCount == 0 {
                Button { tab = 3 } label: {
                    Text("Set up").font(.rounded(14, .bold))
                        .padding(.horizontal, 14).padding(.vertical, 8)
                        .background(Theme.accent, in: Capsule())
                }
                .buttonStyle(PressableStyle())
            }
        }
        .glassCard(padding: 14)
        .confirmationDialog("Emergency pass", isPresented: $confirmPass, titleVisibility: .visible) {
            Button("Unlock \(store.settings.passMinutes) min for \(store.settings.passCost) coins") {
                if store.buyPass(lock: lock) { Haptics.heavy() } else { Haptics.error() }
            }
            .disabled(store.progress.coins < store.settings.passCost)
        } message: {
            Text(store.progress.coins >= store.settings.passCost
                 ? "Passes cost coins and block the “No Excuses” trophy. Studying is cheaper 😉"
                 : "You need \(store.settings.passCost) coins. You have \(store.progress.coins). Answer questions to earn more.")
        }
    }

    private var lockTitle: String {
        if !lock.authorized || lock.lockedCount == 0 { return "No apps locked yet" }
        if let until = lock.passUntil { return "Pass active · \(countdown(to: until))" }
        return lock.isLocked ? "\(lock.lockedCount) locked" : "Apps unlocked"
    }

    private var lockSubtitle: String {
        if !lock.authorized || lock.lockedCount == 0 { return "Choose which apps need a study goal." }
        if lock.passUntil != nil { return "Apps re-lock automatically when it ends." }
        if !lock.lockEnabled { return "Locking is paused in Settings." }
        return lock.isLocked ? "Unlock by hitting today's goal." : "Re-locks at midnight."
    }

    private func countdown(to date: Date) -> String {
        let s = max(0, Int(date.timeIntervalSince(now)))
        return String(format: "%d:%02d", s / 60, s % 60)
    }

    // MARK: Quick start

    private var quickStart: some View {
        VStack(spacing: 12) {
            SectionHeader(title: "Quick start")
            HStack(spacing: 12) {
                QuickTile(title: "SAT Sprint", subtitle: "\(store.settings.sessionLength) mixed SAT", icon: "bolt.fill", color: Theme.violet) {
                    session = .satMix
                }
                QuickTile(title: "Mistakes", subtitle: "\(store.progress.mistakes.count) to review", icon: "arrow.uturn.backward", color: Theme.pink) {
                    if !store.progress.mistakes.isEmpty { session = .mistakes }
                }
            }
            HStack(spacing: 12) {
                QuickTile(title: "Browse", subtitle: "\(Catalog.builtIn.count)+ topics", icon: "square.grid.2x2.fill", color: Theme.cyan) {
                    tab = 1
                }
                QuickTile(title: "Trophies", subtitle: "\(store.progress.unlocked.count)/\(Achievements.all.count) earned", icon: "trophy.fill", color: Theme.gold) {
                    tab = 2
                }
            }
        }
    }

    // MARK: Week

    private var weekStrip: some View {
        VStack(spacing: 12) {
            SectionHeader(title: "This week")
            HStack(spacing: 8) {
                ForEach((0..<7).reversed(), id: \.self) { offset in
                    let date = Calendar.current.date(byAdding: .day, value: -offset, to: now) ?? now
                    let log = store.progress.days[DayKey.string(for: date)]
                    VStack(spacing: 8) {
                        Text(date.formatted(.dateTime.weekday(.narrow))).font(.rounded(12, .semibold)).foregroundStyle(Theme.dim)
                        ZStack {
                            Circle().fill(log?.goalMet == true ? AnyShapeStyle(Theme.fire) : AnyShapeStyle(Color.white.opacity(0.07)))
                            if log?.goalMet == true {
                                Image(systemName: "flame.fill").font(.system(size: 14, weight: .bold))
                            } else if let c = log?.correct, c > 0 {
                                Text("\(c)").font(.rounded(11, .bold)).foregroundStyle(Theme.dim)
                            }
                        }
                        .frame(width: 34, height: 34)
                        .overlay(Circle().stroke(offset == 0 ? Theme.violet : .clear, lineWidth: 2))
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .glassCard(padding: 14)
        }
    }
}

struct QuickTile: View {
    var title: String
    var subtitle: String
    var icon: String
    var color: Color
    var action: () -> Void

    var body: some View {
        Button {
            Haptics.tap()
            action()
        } label: {
            VStack(alignment: .leading, spacing: 10) {
                Image(systemName: icon)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 38, height: 38)
                    .background(color.gradient, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.rounded(16, .bold)).foregroundStyle(.white)
                    Text(subtitle).font(.rounded(12)).foregroundStyle(Theme.dim)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .glassCard(padding: 14)
        }
        .buttonStyle(PressableStyle())
    }
}

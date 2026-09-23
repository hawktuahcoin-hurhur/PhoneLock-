import SwiftUI

@main
struct PhoneLockApp: App {
    @StateObject private var store = GameStore()
    @StateObject private var lock = LockManager()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .environmentObject(lock)
                .preferredColorScheme(.dark)
                .tint(Theme.violet)
        }
        .onChange(of: scenePhase) { phase in
            if phase == .active {
                lock.refreshStatus()
                store.syncLock()
            }
        }
    }
}

struct RootView: View {
    @EnvironmentObject var store: GameStore
    @State private var tab = 0

    var body: some View {
        ZStack {
            AppBackground()
            if store.progress.onboarded {
                TabView(selection: $tab) {
                    HomeView(tab: $tab).tag(0)
                        .tabItem { Label("Today", systemImage: "flame.fill") }
                    StudyView().tag(1)
                        .tabItem { Label("Study", systemImage: "books.vertical.fill") }
                    TrophiesView().tag(2)
                        .tabItem { Label("Trophies", systemImage: "trophy.fill") }
                    SettingsView().tag(3)
                        .tabItem { Label("Settings", systemImage: "slider.horizontal.3") }
                }
            } else {
                OnboardingView()
                    .transition(.opacity)
            }
        }
        .overlay(alignment: .top) { EventToast(inQuiz: false) }
    }
}

/// Pops up level-ups, achievements, and goal completion from anywhere in the app.
struct EventToast: View {
    /// One toast lives on the root view and one on the quiz cover; only the visible one consumes events.
    var inQuiz: Bool
    @EnvironmentObject var store: GameStore
    @State private var current: GameEvent?

    var body: some View {
        ZStack {
            if current == .goalComplete { ConfettiView() }
            if let e = current {
                HStack(spacing: 12) {
                    Image(systemName: icon(e)).font(.title2).foregroundStyle(Theme.fire)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(title(e)).font(.rounded(16, .bold))
                        Text(subtitle(e)).font(.rounded(13)).foregroundStyle(Theme.dim)
                    }
                    Spacer()
                }
                .glassCard(padding: 14)
                .padding(.horizontal)
                .frame(maxHeight: .infinity, alignment: .top)
                .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .onChange(of: store.events) { _ in showNext() }
        .onChange(of: store.quizActive) { _ in showNext() }
        .onAppear { showNext() }
    }

    private func showNext() {
        guard store.quizActive == inQuiz, current == nil, let next = store.events.first else { return }
        Haptics.success()
        withAnimation(.spring()) { current = next }
        DispatchQueue.main.asyncAfter(deadline: .now() + (next == .goalComplete ? 3.5 : 2.4)) {
            withAnimation(.easeInOut) { current = nil }
            if !store.events.isEmpty { store.events.removeFirst() }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { showNext() }
        }
    }

    private func icon(_ e: GameEvent) -> String {
        switch e {
        case .levelUp: return "arrow.up.circle.fill"
        case .achievement(let id): return Achievements.all.first { $0.id == id }?.icon ?? "star.fill"
        case .goalComplete: return "lock.open.fill"
        }
    }

    private func title(_ e: GameEvent) -> String {
        switch e {
        case .levelUp(let l): return "Level \(l)! \(Leveling.title(for: l))"
        case .achievement(let id): return "🏆 " + (Achievements.all.first { $0.id == id }?.title ?? "Achievement")
        case .goalComplete: return "Daily goal crushed!"
        }
    }

    private func subtitle(_ e: GameEvent) -> String {
        switch e {
        case .levelUp(let l): return "+\(20 * l) coins"
        case .achievement(let id):
            let a = Achievements.all.first { $0.id == id }
            return "\(a?.detail ?? "") · +\(a?.reward ?? 0) coins"
        case .goalComplete: return "Your apps are unlocked for the rest of today."
        }
    }
}

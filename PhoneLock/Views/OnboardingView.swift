import SwiftUI
import FamilyControls

struct OnboardingView: View {
    @EnvironmentObject var store: GameStore
    @EnvironmentObject var lock: LockManager
    @State private var step = 0
    @State private var showPicker = false
    @State private var goal = 30
    @State private var satMin = 10

    var body: some View {
        VStack(spacing: 28) {
            HStack(spacing: 6) {
                ForEach(0..<3) { i in
                    Capsule().fill(i <= step ? AnyShapeStyle(Theme.accent) : AnyShapeStyle(Color.white.opacity(0.12)))
                        .frame(height: 5)
                }
            }
            .padding(.top, 12)

            Spacer()

            Group {
                switch step {
                case 0: welcome
                case 1: pickApps
                default: goals
                }
            }
            .transition(.asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity),
                                    removal: .move(edge: .leading).combined(with: .opacity)))

            Spacer()
        }
        .padding(24)
        .familyActivityPicker(isPresented: $showPicker, selection: Binding(
            get: { lock.selection },
            set: { lock.save(selection: $0) }
        ))
    }

    private var welcome: some View {
        VStack(spacing: 22) {
            ZStack {
                Circle().fill(Theme.accent).frame(width: 120, height: 120).blur(radius: 30).opacity(0.7)
                Image(systemName: "lock.shield.fill").font(.system(size: 72)).foregroundStyle(.white)
            }
            Text("Earn your screen time.").font(.rounded(34, .heavy)).multilineTextAlignment(.center)
            Text("PhoneLock locks your distracting apps every morning. Hit your daily study goal — SAT prep plus hundreds of topics — and they unlock.")
                .font(.rounded(17)).foregroundStyle(Theme.dim).multilineTextAlignment(.center)
            Button("Get started") { next() }.buttonStyle(PrimaryButtonStyle()).padding(.top, 8)
        }
    }

    private var pickApps: some View {
        VStack(spacing: 22) {
            Image(systemName: "apps.iphone.badge.plus").font(.system(size: 64)).foregroundStyle(Theme.accent)
            Text("Pick what gets locked").font(.rounded(30, .heavy)).multilineTextAlignment(.center)
            Text("Allow Screen Time access, then choose the apps, categories, or websites that stay locked until you've studied.")
                .font(.rounded(16)).foregroundStyle(Theme.dim).multilineTextAlignment(.center)

            if lock.authorized {
                Button {
                    showPicker = true
                } label: {
                    Label(lock.lockedCount == 0 ? "Choose apps" : "\(lock.lockedCount) selected — edit", systemImage: "checklist")
                }
                .buttonStyle(PrimaryButtonStyle())
                Button("Continue") { next() }
                    .font(.rounded(17, .semibold))
                    .disabled(lock.lockedCount == 0)
                    .opacity(lock.lockedCount == 0 ? 0.4 : 1)
            } else {
                Button {
                    Task { await lock.requestAuthorization() }
                } label: {
                    Label("Allow Screen Time access", systemImage: "hourglass")
                }
                .buttonStyle(PrimaryButtonStyle())
            }
            if let err = lock.errorMessage {
                Text(err).font(.rounded(13)).foregroundStyle(Theme.danger).multilineTextAlignment(.center)
            }
            Button("Skip for now") { next() }.font(.rounded(14)).foregroundStyle(Theme.dim)
        }
    }

    private var goals: some View {
        VStack(spacing: 22) {
            Image(systemName: "target").font(.system(size: 64)).foregroundStyle(Theme.accent)
            Text("Set your daily intake").font(.rounded(30, .heavy))
            VStack(spacing: 14) {
                Stepper(value: $goal, in: 5...300, step: 5) {
                    VStack(alignment: .leading) {
                        Text("\(goal) correct answers").font(.rounded(18, .bold))
                        Text("Any topic counts").font(.rounded(13)).foregroundStyle(Theme.dim)
                    }
                }
                Divider().overlay(Theme.stroke)
                Stepper(value: $satMin, in: 0...200, step: 5) {
                    VStack(alignment: .leading) {
                        Text("\(satMin) of them SAT").font(.rounded(18, .bold))
                        Text("SAT Math, Reading & Writing, Vocab").font(.rounded(13)).foregroundStyle(Theme.dim)
                    }
                }
            }
            .glassCard()
            Button("Start studying") {
                store.updateSettings {
                    $0.dailyGoal = goal
                    $0.satMinimum = min(satMin, goal)
                }
                withAnimation { store.progress.onboarded = true }
                lock.refreshStatus()
                store.syncLock()
            }
            .buttonStyle(PrimaryButtonStyle())
        }
    }

    private func next() {
        Haptics.tap()
        withAnimation(.spring(response: 0.5, dampingFraction: 0.85)) { step += 1 }
    }
}

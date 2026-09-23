import SwiftUI

struct QuizView: View {
    let mode: SessionMode
    @EnvironmentObject var store: GameStore
    @Environment(\.dismiss) private var dismiss

    @State private var questions: [Question] = []
    @State private var index = 0
    @State private var selected: Int?
    @State private var combo = 0
    @State private var sessionBestCombo = 0
    @State private var correctCount = 0
    @State private var xpGained = 0
    @State private var loading = true
    @State private var errorText: String?
    @State private var floatingXP: Int?
    @State private var shakes: CGFloat = 0
    @State private var finished = false

    private var current: Question? { questions.indices.contains(index) ? questions[index] : nil }

    var body: some View {
        ZStack {
            AppBackground()
            VStack(spacing: 18) {
                topBar
                if loading {
                    Spacer()
                    ProgressView().controlSize(.large).tint(.white)
                    Text(isAI ? "Claude is writing your questions…" : "Loading…").font(.rounded(15)).foregroundStyle(Theme.dim)
                    Spacer()
                } else if let errorText {
                    Spacer()
                    EmptyState(icon: "exclamationmark.triangle.fill", title: "Couldn't start", message: errorText)
                    Button("Try again") { Task { await load() } }.buttonStyle(PrimaryButtonStyle())
                    Spacer()
                } else if finished {
                    summary
                } else if let q = current {
                    questionView(q)
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 12)
        }
        .overlay(alignment: .top) { EventToast(inQuiz: true) }
        .onAppear { store.quizActive = true }
        .onDisappear { store.quizActive = false }
        .task { await load() }
    }

    private var isAI: Bool {
        if case .topic(let t) = mode { return t.isAI }
        return false
    }

    // MARK: Top bar

    private var topBar: some View {
        HStack(spacing: 14) {
            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark").font(.system(size: 16, weight: .bold))
                    .frame(width: 36, height: 36)
                    .background(Color.white.opacity(0.08), in: Circle())
            }
            .foregroundStyle(.white)

            Bar(value: questions.isEmpty ? 0 : Double(index + (selected == nil ? 0 : 1)) / Double(questions.count),
                color: Theme.cyan, height: 12)

            HStack(spacing: 4) {
                Image(systemName: "flame.fill").foregroundStyle(combo >= 3 ? AnyShapeStyle(Theme.fire) : AnyShapeStyle(Theme.dim))
                Text("\(combo)").font(.rounded(16, .heavy)).monospacedDigit()
            }
            .scaleEffect(combo >= 3 ? 1.15 : 1)
            .animation(.spring(response: 0.3, dampingFraction: 0.5), value: combo)
        }
        .padding(.top, 8)
    }

    // MARK: Question

    private func questionView(_ q: Question) -> some View {
        VStack(spacing: 16) {
            HStack {
                Text(mode.title.uppercased()).font(.rounded(12, .heavy)).tracking(1.2).foregroundStyle(Theme.dim)
                Spacer()
                Text("\(index + 1) / \(questions.count)").font(.rounded(12, .bold)).foregroundStyle(Theme.dim)
            }

            ScrollView {
                VStack(spacing: 16) {
                    Text(q.prompt)
                        .font(.rounded(21, .bold))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .fixedSize(horizontal: false, vertical: true)
                        .glassCard(padding: 20)
                        .overlay(alignment: .topTrailing) {
                            if let xp = floatingXP {
                                Text("+\(xp) XP")
                                    .font(.rounded(18, .heavy))
                                    .foregroundStyle(Theme.success)
                                    .offset(y: -28)
                                    .transition(.move(edge: .bottom).combined(with: .opacity))
                            }
                        }

                    VStack(spacing: 10) {
                        ForEach(Array(q.choices.enumerated()), id: \.offset) { i, choice in
                            AnswerButton(text: choice, letter: ["A", "B", "C", "D", "E", "F"][min(i, 5)],
                                         state: state(for: i, q: q)) {
                                answer(i, q: q)
                            }
                        }
                    }
                    .modifier(Shake(animatableData: shakes))

                    if selected != nil, let explanation = q.explanation, selected != q.answerIndex {
                        HStack(alignment: .top, spacing: 10) {
                            Image(systemName: "lightbulb.fill").foregroundStyle(Theme.gold)
                            Text(explanation).font(.rounded(15)).foregroundStyle(.white.opacity(0.9))
                            Spacer(minLength: 0)
                        }
                        .glassCard(padding: 14)
                        .transition(.opacity.combined(with: .move(edge: .bottom)))
                    }
                }
                .padding(.top, 20)
            }
            .scrollIndicators(.hidden)

            if selected != nil {
                Button(index + 1 < questions.count ? "Continue" : "Finish") { advance() }
                    .buttonStyle(PrimaryButtonStyle(gradient: selected == q.answerIndex ? Theme.success : Theme.accent))
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .id(q.id + "\(index)")
        .transition(.asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity), removal: .opacity))
    }

    private func state(for i: Int, q: Question) -> AnswerButton.Look {
        guard let s = selected else { return .idle }
        if i == q.answerIndex { return .correct }
        if i == s { return .wrong }
        return .dimmed
    }

    private func answer(_ i: Int, q: Question) {
        guard selected == nil else { return }
        let correct = i == q.answerIndex
        withAnimation(.spring(response: 0.35, dampingFraction: 0.7)) { selected = i }
        if correct {
            combo += 1
            sessionBestCombo = max(sessionBestCombo, combo)
            correctCount += 1
            Haptics.success()
        } else {
            combo = 0
            Haptics.error()
            withAnimation(.linear(duration: 0.4)) { shakes += 1 }
        }
        let xp = store.record(q, topic: topic(for: q), correct: correct, combo: combo)
        xpGained += xp
        if xp > 0 {
            withAnimation(.spring()) { floatingXP = xp }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.9) { withAnimation { floatingXP = nil } }
        }
    }

    private func topic(for q: Question) -> Topic? {
        if case .topic(let t) = mode { return t }
        return Catalog.builtIn.first { $0.id == q.topicID }
    }

    private func advance() {
        Haptics.tap()
        withAnimation(.spring(response: 0.45, dampingFraction: 0.85)) {
            if index + 1 < questions.count {
                index += 1
                selected = nil
            } else {
                store.finishSession(correct: correctCount, total: questions.count)
                finished = true
            }
        }
    }

    private func load() async {
        loading = true
        errorText = nil
        do {
            let qs = try await QuestionEngine.build(mode, store: store)
            if qs.isEmpty {
                errorText = mode == .mistakes ? "No mistakes to review. Nice work!" : "No questions available for this topic."
            }
            questions = qs
            index = 0
            selected = nil
            correctCount = 0
            xpGained = 0
            sessionBestCombo = 0
            finished = false
        } catch {
            errorText = error.localizedDescription
        }
        withAnimation { loading = false }
    }

    // MARK: Summary

    private var summary: some View {
        let accuracy = questions.isEmpty ? 0 : Double(correctCount) / Double(questions.count)
        return VStack(spacing: 20) {
            Spacer()
            ZStack {
                ProgressRing(progress: accuracy, lineWidth: 16, gradient: [Theme.mint, Theme.cyan, Theme.mint])
                    .frame(width: 150, height: 150)
                VStack(spacing: 0) {
                    Text("\(Int(accuracy * 100))%").font(.rounded(40, .heavy))
                    Text("accuracy").font(.rounded(13)).foregroundStyle(Theme.dim)
                }
            }
            Text(accuracy == 1 ? "Flawless! ✨" : accuracy >= 0.8 ? "Great round!" : accuracy >= 0.5 ? "Solid work" : "Keep pushing")
                .font(.rounded(28, .heavy))

            HStack(spacing: 12) {
                summaryStat("\(correctCount)/\(questions.count)", "correct", "checkmark.circle.fill", Theme.mint)
                summaryStat("+\(xpGained)", "XP", "sparkles", Theme.violet)
                summaryStat("\(sessionBestCombo)", "best combo", "flame.fill", Theme.gold)
            }

            VStack(spacing: 6) {
                HStack {
                    Text("Daily goal").font(.rounded(14, .semibold))
                    Spacer()
                    Text(store.goalMet ? "Complete 🔓" : "\(Int(store.goalFraction * 100))%").font(.rounded(14, .bold))
                }
                Bar(value: store.goalFraction, color: store.goalMet ? Theme.mint : Theme.violet, height: 10)
                if !store.goalMet {
                    Text(store.remainingText).font(.rounded(12)).foregroundStyle(Theme.dim).frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .glassCard(padding: 14)

            Spacer()
            Button("Another round") { Task { await load() } }.buttonStyle(PrimaryButtonStyle())
            Button("Done") { dismiss() }.font(.rounded(16, .semibold)).foregroundStyle(Theme.dim)
        }
    }

    private func summaryStat(_ value: String, _ label: String, _ icon: String, _ color: Color) -> some View {
        VStack(spacing: 6) {
            Image(systemName: icon).foregroundStyle(color)
            Text(value).font(.rounded(20, .heavy)).monospacedDigit()
            Text(label).font(.rounded(12)).foregroundStyle(Theme.dim)
        }
        .frame(maxWidth: .infinity)
        .glassCard(padding: 12)
    }
}

struct AnswerButton: View {
    enum Look { case idle, correct, wrong, dimmed }
    var text: String
    var letter: String
    var state: Look
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                Text(letter)
                    .font(.rounded(15, .heavy))
                    .frame(width: 32, height: 32)
                    .background(badgeColor, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                Text(text)
                    .font(.rounded(17, .semibold))
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
                if state == .correct { Image(systemName: "checkmark.circle.fill").foregroundStyle(Theme.mint) }
                if state == .wrong { Image(systemName: "xmark.circle.fill").foregroundStyle(Theme.danger) }
            }
            .foregroundStyle(.white)
            .padding(14)
            .background(background, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(border, lineWidth: state == .idle ? 1 : 2))
            .opacity(state == .dimmed ? 0.45 : 1)
            .scaleEffect(state == .correct ? 1.02 : 1)
        }
        .buttonStyle(PressableStyle())
        .disabled(state != .idle)
    }

    private var badgeColor: Color {
        switch state {
        case .correct: return Theme.mint.opacity(0.35)
        case .wrong: return Theme.danger.opacity(0.35)
        default: return Color.white.opacity(0.1)
        }
    }

    private var background: Color {
        switch state {
        case .correct: return Theme.mint.opacity(0.14)
        case .wrong: return Theme.danger.opacity(0.14)
        default: return Color.white.opacity(0.06)
        }
    }

    private var border: Color {
        switch state {
        case .correct: return Theme.mint
        case .wrong: return Theme.danger
        default: return Theme.stroke
        }
    }
}

struct Shake: GeometryEffect {
    var animatableData: CGFloat
    func effectValue(size: CGSize) -> ProjectionTransform {
        ProjectionTransform(CGAffineTransform(translationX: 10 * sin(animatableData * .pi * 4), y: 0))
    }
}

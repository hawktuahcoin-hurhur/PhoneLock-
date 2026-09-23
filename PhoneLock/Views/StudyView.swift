import SwiftUI

struct StudyView: View {
    @EnvironmentObject var store: GameStore
    @State private var search = ""
    @State private var subject: Subject?
    @State private var session: SessionMode?
    @State private var showCustomTopic = false
    @State private var customTopic = ""

    private var allTopics: [Topic] {
        Catalog.builtIn
            + Catalog.customTopics(store.progress.customDecks)
            + store.progress.customAITopics.map(Catalog.customAITopic)
    }

    private var filtered: [Topic] {
        allTopics.filter { t in
            (subject == nil || t.subject == subject) &&
            (search.isEmpty || t.name.localizedCaseInsensitiveContains(search) || t.subject.rawValue.localizedCaseInsensitiveContains(search))
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 16, pinnedViews: []) {
                    subjectChips
                    ForEach(Subject.allCases.filter { s in filtered.contains { $0.subject == s } }) { s in
                        section(s, topics: filtered.filter { $0.subject == s })
                    }
                    if filtered.isEmpty {
                        EmptyState(icon: "magnifyingglass", title: "No matches",
                                   message: "Tap ✨ to study “\(search)” with AI-generated questions.")
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
            .scrollIndicators(.hidden)
            .background(AppBackground())
            .navigationTitle("Study")
            .searchable(text: $search, prompt: "Search \(allTopics.count) topics")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        customTopic = search
                        showCustomTopic = true
                    } label: {
                        Image(systemName: "sparkles")
                    }
                }
            }
            .alert("Study any topic", isPresented: $showCustomTopic) {
                TextField("e.g. Photosynthesis, AP Stats, Rust", text: $customTopic)
                Button("Add") {
                    let name = customTopic.trimmingCharacters(in: .whitespaces)
                    guard !name.isEmpty else { return }
                    if !store.progress.customAITopics.contains(name) { store.progress.customAITopics.append(name) }
                    session = .topic(Catalog.customAITopic(name))
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Claude will write fresh questions for it. Requires an API key in Settings.")
            }
        }
        .fullScreenCover(item: $session) { QuizView(mode: $0) }
    }

    private var subjectChips: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                chip("All", icon: "square.grid.2x2.fill", selected: subject == nil) { subject = nil }
                ForEach(Subject.allCases) { s in
                    chip(s.rawValue, icon: s.icon, selected: subject == s) { subject = subject == s ? nil : s }
                }
            }
            .padding(.vertical, 4)
        }
        .scrollIndicators(.hidden)
    }

    private func chip(_ title: String, icon: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button {
            Haptics.tap()
            withAnimation(.spring(response: 0.3)) { action() }
        } label: {
            Label(title, systemImage: icon)
                .font(.rounded(14, .semibold))
                .padding(.horizontal, 14)
                .padding(.vertical, 9)
                .background(selected ? AnyShapeStyle(Theme.accent) : AnyShapeStyle(Color.white.opacity(0.08)), in: Capsule())
                .overlay(Capsule().stroke(Theme.stroke))
                .foregroundStyle(.white)
        }
        .buttonStyle(PressableStyle())
    }

    private func section(_ s: Subject, topics: [Topic]) -> some View {
        VStack(spacing: 10) {
            HStack {
                Image(systemName: s.icon).foregroundStyle(Theme.subjectColor(s))
                Text(s.rawValue).font(.rounded(18, .heavy))
                Spacer()
                Text("\(topics.count)").font(.rounded(13, .bold)).foregroundStyle(Theme.dim)
            }
            .padding(.top, 8)
            ForEach(topics) { t in
                TopicRow(topic: t, stat: store.progress.topics[t.id]) {
                    Haptics.tap()
                    session = .topic(t)
                }
            }
        }
    }
}

struct TopicRow: View {
    var topic: Topic
    var stat: TopicStat?
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(Theme.subjectColor(topic.subject).opacity(0.18))
                    Image(systemName: topic.isAI ? "sparkles" : topic.subject.icon)
                        .foregroundStyle(Theme.subjectColor(topic.subject))
                }
                .frame(width: 42, height: 42)

                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text(topic.name).font(.rounded(16, .semibold)).foregroundStyle(.white).lineLimit(1)
                        Spacer()
                        if let stat, stat.answered > 0 {
                            Text("\(Int(stat.accuracy * 100))%").font(.rounded(12, .bold)).foregroundStyle(Theme.dim)
                        }
                    }
                    if let stat, stat.answered > 0 {
                        Bar(value: stat.mastery, color: Theme.subjectColor(topic.subject), height: 5)
                    } else {
                        Text(topic.badge).font(.rounded(12)).foregroundStyle(Theme.dim)
                    }
                }
                Image(systemName: "chevron.right").font(.system(size: 13, weight: .bold)).foregroundStyle(Theme.dim)
            }
            .glassCard(padding: 12)
        }
        .buttonStyle(PressableStyle())
    }
}

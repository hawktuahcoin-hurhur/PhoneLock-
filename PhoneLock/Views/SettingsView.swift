import SwiftUI
import FamilyControls

struct SettingsView: View {
    @EnvironmentObject var store: GameStore
    @EnvironmentObject var lock: LockManager
    @State private var showPicker = false
    @State private var apiKey = Keychain.apiKey ?? ""
    @State private var keySaved = false
    @State private var showDeckEditor = false
    @State private var confirmReset = false

    /// Commitment mode: while apps are locked you can make goals harder, never easier.
    private var committed: Bool { lock.isLocked }

    var body: some View {
        NavigationStack {
            Form {
                lockSection
                goalSection
                shopSection
                aiSection
                decksSection
                Section {
                    Button("Reset progress", role: .destructive) { confirmReset = true }
                } footer: {
                    Text("Keeps your settings and decks.")
                }
            }
            .scrollContentBackground(.hidden)
            .background(AppBackground())
            .navigationTitle("Settings")
            .familyActivityPicker(isPresented: $showPicker, selection: Binding(
                get: { lock.selection },
                set: { lock.save(selection: $0) }
            ))
            .sheet(isPresented: $showDeckEditor) { DeckEditor() }
            .confirmationDialog("Reset all XP, streaks, and stats?", isPresented: $confirmReset, titleVisibility: .visible) {
                Button("Reset", role: .destructive) { store.resetProgress() }
            }
        }
    }

    // MARK: Sections

    private var lockSection: some View {
        Section {
            if lock.authorized {
                Button {
                    showPicker = true
                } label: {
                    row("Locked apps", icon: "apps.iphone", value: lock.lockedCount == 0 ? "None" : "\(lock.lockedCount) selected")
                }
                .disabled(committed)
                Toggle(isOn: Binding(get: { lock.lockEnabled }, set: { lock.setLockEnabled($0) })) {
                    Label("Lock until goal is met", systemImage: "lock.fill")
                }
                .disabled(committed && lock.lockEnabled)
            } else {
                Button {
                    Task { await lock.requestAuthorization() }
                } label: {
                    Label("Allow Screen Time access", systemImage: "hourglass")
                }
            }
        } header: {
            Text("App lock")
        } footer: {
            Text(committed
                 ? "Commitment mode: while your apps are locked you can't remove apps, pause the lock, or lower goals. Finish today's goal first."
                 : "Apps re-lock every day at midnight.")
        }
    }

    private var goalSection: some View {
        let s = store.settings
        return Section {
            Stepper(value: Binding(get: { s.dailyGoal }, set: { v in store.updateSettings { $0.dailyGoal = v } }),
                    in: (committed ? s.dailyGoal : 5)...500, step: 5) {
                row("Daily correct answers", icon: "target", value: "\(s.dailyGoal)")
            }
            Stepper(value: Binding(get: { s.satMinimum }, set: { v in store.updateSettings { $0.satMinimum = v } }),
                    in: (committed ? s.satMinimum : 0)...max(s.satMinimum, s.dailyGoal), step: 5) {
                row("of which SAT", icon: "pencil.and.ruler.fill", value: "\(s.satMinimum)")
            }
            Stepper(value: Binding(get: { s.sessionLength }, set: { v in store.updateSettings { $0.sessionLength = v } }),
                    in: 5...30, step: 5) {
                row("Questions per round", icon: "rectangle.stack.fill", value: "\(s.sessionLength)")
            }
            Toggle(isOn: Binding(get: { s.strictMode }, set: { v in store.updateSettings { $0.strictMode = v } })) {
                Label("Strict mode", systemImage: "exclamationmark.shield.fill")
            }
            .disabled(committed && s.strictMode)
        } header: {
            Text("Daily intake")
        } footer: {
            Text("Strict mode: each wrong answer takes one correct answer off today's progress, so guessing doesn't pay.")
        }
    }

    private var shopSection: some View {
        Section {
            HStack {
                Label("Coins", systemImage: "circle.hexagongrid.fill")
                Spacer()
                Text("\(store.progress.coins)").font(.rounded(16, .bold)).monospacedDigit()
            }
            Button {
                if store.buyFreeze() { Haptics.success() } else { Haptics.error() }
            } label: {
                row("Buy streak freeze (\(store.progress.streakFreezes)/3)", icon: "snowflake", value: "\(GameStore.freezeCost) coins")
            }
            .disabled(store.progress.coins < GameStore.freezeCost || store.progress.streakFreezes >= 3)
        } header: {
            Text("Shop")
        } footer: {
            Text("A freeze protects your streak for one missed day. Emergency passes (\(store.settings.passCost) coins for \(store.settings.passMinutes) min) are on the Today tab.")
        }
    }

    private var aiSection: some View {
        Section {
            SecureField("sk-ant-…", text: $apiKey)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            Button(keySaved ? "Saved ✓" : "Save key") {
                Keychain.apiKey = apiKey
                keySaved = true
                Haptics.success()
            }
            Picker(selection: Binding(get: { store.settings.aiModel }, set: { v in store.updateSettings { $0.aiModel = v } })) {
                ForEach(AIService.models, id: \.self) { Text($0).tag($0) }
            } label: {
                Label("Model", systemImage: "cpu")
            }
        } header: {
            Text("AI topics")
        } footer: {
            Text("\(AITopics.catalog.reduce(0) { $0 + $1.1.count }) topics (plus anything you type with ✨) use Claude to write fresh questions. Get a key at console.anthropic.com. Stored in the Keychain; calls go directly from your phone to Anthropic.")
        }
    }

    private var decksSection: some View {
        Section {
            ForEach(store.progress.customDecks) { deck in
                row(deck.name, icon: "square.stack.3d.up.fill", value: "\(deck.pairs.count) cards")
            }
            .onDelete { store.progress.customDecks.remove(atOffsets: $0) }
            ForEach(store.progress.customAITopics, id: \.self) { name in
                row(name, icon: "sparkles", value: "AI")
            }
            .onDelete { store.progress.customAITopics.remove(atOffsets: $0) }
            Button {
                showDeckEditor = true
            } label: {
                Label("New flashcard deck", systemImage: "plus.circle.fill")
            }
        } header: {
            Text("My decks")
        } footer: {
            Text("Paste your own notes as “term | definition” lines to turn them into quiz topics.")
        }
    }

    private func row(_ title: String, icon: String, value: String) -> some View {
        HStack {
            Label(title, systemImage: icon).foregroundStyle(.white)
            Spacer()
            Text(value).foregroundStyle(Theme.dim)
        }
    }
}

struct DeckEditor: View {
    @EnvironmentObject var store: GameStore
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var text = ""

    private var pairs: [[String]] {
        text.split(separator: "\n").compactMap { line in
            let separators = ["|", " - ", " — ", "\t", ":"]
            for sep in separators where line.contains(sep) {
                let parts = line.components(separatedBy: sep)
                let front = parts[0].trimmingCharacters(in: .whitespaces)
                let back = parts.dropFirst().joined(separator: sep).trimmingCharacters(in: .whitespaces)
                if !front.isEmpty && !back.isEmpty { return [front, back] }
            }
            return nil
        }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Name") {
                    TextField("e.g. AP Bio Unit 3", text: $name)
                }
                Section {
                    TextEditor(text: $text)
                        .frame(minHeight: 260)
                        .font(.system(.body, design: .monospaced))
                } header: {
                    Text("Cards")
                } footer: {
                    Text("One per line: term | definition  (also accepts “ - ”, “:” or tab). \(pairs.count) cards detected — at least 4 needed.")
                }
            }
            .scrollContentBackground(.hidden)
            .background(AppBackground())
            .navigationTitle("New deck")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        store.progress.customDecks.append(CustomDeck(name: name.isEmpty ? "My Deck" : name, pairs: pairs))
                        dismiss()
                    }
                    .disabled(pairs.count < 4)
                }
            }
        }
    }
}

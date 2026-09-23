import SwiftUI
import UIKit

enum Theme {
    static let bgTop = Color(red: 0.05, green: 0.05, blue: 0.12)
    static let bgBottom = Color(red: 0.10, green: 0.05, blue: 0.20)
    static let violet = Color(red: 0.49, green: 0.36, blue: 1.00)
    static let cyan = Color(red: 0.20, green: 0.84, blue: 0.98)
    static let pink = Color(red: 1.00, green: 0.36, blue: 0.62)
    static let gold = Color(red: 1.00, green: 0.78, blue: 0.24)
    static let mint = Color(red: 0.25, green: 0.92, blue: 0.62)
    static let danger = Color(red: 1.00, green: 0.33, blue: 0.38)
    static let card = Color.white.opacity(0.06)
    static let stroke = Color.white.opacity(0.10)
    static let dim = Color.white.opacity(0.6)

    static let accent = LinearGradient(colors: [violet, cyan], startPoint: .topLeading, endPoint: .bottomTrailing)
    static let fire = LinearGradient(colors: [gold, pink], startPoint: .top, endPoint: .bottom)
    static let success = LinearGradient(colors: [mint, cyan], startPoint: .leading, endPoint: .trailing)

    static func subjectColor(_ s: Subject) -> Color {
        switch s {
        case .satMath: return violet
        case .satReading: return pink
        case .vocab: return gold
        case .math: return cyan
        case .science: return mint
        case .history: return Color(red: 0.95, green: 0.55, blue: 0.30)
        case .geography: return Color(red: 0.30, green: 0.70, blue: 1.0)
        case .languages: return Color(red: 0.85, green: 0.45, blue: 1.0)
        case .humanities: return Color(red: 1.0, green: 0.50, blue: 0.50)
        case .tech: return Color(red: 0.40, green: 0.95, blue: 0.85)
        case .social: return Color(red: 0.95, green: 0.75, blue: 0.45)
        case .business: return Color(red: 0.55, green: 0.85, blue: 0.40)
        case .custom: return .white
        }
    }
}

struct AppBackground: View {
    var body: some View {
        ZStack {
            LinearGradient(colors: [Theme.bgTop, Theme.bgBottom], startPoint: .top, endPoint: .bottom)
            Circle().fill(Theme.violet.opacity(0.25)).frame(width: 380).blur(radius: 120).offset(x: -140, y: -320)
            Circle().fill(Theme.cyan.opacity(0.18)).frame(width: 320).blur(radius: 120).offset(x: 160, y: 380)
        }
        .ignoresSafeArea()
    }
}

struct GlassCard: ViewModifier {
    var padding: CGFloat = 18
    func body(content: Content) -> some View {
        content
            .padding(padding)
            .background(.ultraThinMaterial.opacity(0.5), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .background(Theme.card, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(Theme.stroke, lineWidth: 1))
    }
}

extension View {
    func glassCard(padding: CGFloat = 18) -> some View { modifier(GlassCard(padding: padding)) }
}

extension Font {
    static func rounded(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .rounded)
    }
}

struct PrimaryButtonStyle: ButtonStyle {
    var gradient: LinearGradient = Theme.accent
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.rounded(17, .bold))
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(gradient, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .shadow(color: Theme.violet.opacity(0.45), radius: configuration.isPressed ? 4 : 14, y: 6)
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

struct PressableStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

enum Haptics {
    static func tap() { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
    static func success() { UINotificationFeedbackGenerator().notificationOccurred(.success) }
    static func error() { UINotificationFeedbackGenerator().notificationOccurred(.error) }
    static func heavy() { UIImpactFeedbackGenerator(style: .heavy).impactOccurred() }
}

import SwiftUI

struct ProgressRing: View {
    var progress: Double
    var lineWidth: CGFloat = 18
    var gradient: [Color] = [Theme.violet, Theme.cyan, Theme.mint, Theme.violet]

    var body: some View {
        ZStack {
            Circle().stroke(Color.white.opacity(0.08), lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: max(0.001, progress))
                .stroke(AngularGradient(colors: gradient, center: .center),
                        style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .shadow(color: Theme.cyan.opacity(0.5), radius: 10)
        }
        .animation(.spring(response: 0.8, dampingFraction: 0.8), value: progress)
    }
}

struct Bar: View {
    var value: Double
    var color: Color = Theme.violet
    var height: CGFloat = 8

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.white.opacity(0.08))
                Capsule()
                    .fill(LinearGradient(colors: [color, color.opacity(0.6)], startPoint: .leading, endPoint: .trailing))
                    .frame(width: max(height, geo.size.width * min(1, max(0, value))))
            }
        }
        .frame(height: height)
        .animation(.spring(response: 0.6, dampingFraction: 0.8), value: value)
    }
}

struct StatPill: View {
    var icon: String
    var value: String
    var tint: Color

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: icon).foregroundStyle(tint)
            Text(value).font(.rounded(16, .bold)).monospacedDigit()
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Color.white.opacity(0.08), in: Capsule())
        .overlay(Capsule().stroke(Theme.stroke))
    }
}

struct SectionHeader: View {
    var title: String
    var body: some View {
        Text(title.uppercased())
            .font(.rounded(12, .heavy))
            .tracking(1.5)
            .foregroundStyle(Theme.dim)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Lightweight confetti burst drawn with Canvas.
struct ConfettiView: View {
    private struct Piece {
        let x: Double, speed: Double, drift: Double, spin: Double, size: Double, color: Color, delay: Double
    }

    private let pieces: [Piece] = (0..<120).map { _ in
        Piece(x: .random(in: 0...1), speed: .random(in: 250...520), drift: .random(in: -60...60),
              spin: .random(in: 1...6), size: .random(in: 6...12),
              color: [Theme.violet, Theme.cyan, Theme.pink, Theme.gold, Theme.mint].randomElement()!,
              delay: .random(in: 0...0.6))
    }
    @State private var start = Date()

    var body: some View {
        TimelineView(.animation) { timeline in
            Canvas { ctx, size in
                let t = timeline.date.timeIntervalSince(start)
                for p in pieces {
                    let life = t - p.delay
                    guard life > 0 else { continue }
                    let y = -20 + p.speed * life
                    guard y < size.height + 20 else { continue }
                    let x = p.x * size.width + sin(life * p.spin) * p.drift
                    var c = ctx
                    c.translateBy(x: x, y: y)
                    c.rotate(by: .radians(life * p.spin))
                    c.fill(Path(CGRect(x: -p.size / 2, y: -p.size / 4, width: p.size, height: p.size / 2)), with: .color(p.color))
                }
            }
        }
        .allowsHitTesting(false)
        .ignoresSafeArea()
    }
}

struct EmptyState: View {
    var icon: String
    var title: String
    var message: String

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: icon).font(.system(size: 44)).foregroundStyle(Theme.accent)
            Text(title).font(.rounded(20, .bold))
            Text(message).font(.rounded(15)).foregroundStyle(Theme.dim).multilineTextAlignment(.center)
        }
        .padding(32)
    }
}

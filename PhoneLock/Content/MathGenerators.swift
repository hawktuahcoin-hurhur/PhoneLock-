import Foundation

/// Procedural question generators: every call produces a fresh question, so these topics never run out.
enum Gen {
    static func r(_ range: ClosedRange<Int>) -> Int { Int.random(in: range) }

    static func nonZero(_ range: ClosedRange<Int>) -> Int {
        var v = 0
        while v == 0 { v = r(range) }
        return v
    }

    /// Integer distractors near the answer.
    static func near(_ answer: Int, spread: Int = 5) -> [String] {
        var out: Set<Int> = []
        var guardCount = 0
        while out.count < 3 && guardCount < 100 {
            guardCount += 1
            let d = answer + nonZero(-spread...spread)
            if d != answer { out.insert(d) }
        }
        return out.map(String.init)
    }

    static func fmt(_ x: Double) -> String {
        if x == x.rounded() { return String(Int(x)) }
        return String(format: "%.2f", x).replacingOccurrences(of: #"0+$"#, with: "", options: .regularExpression)
    }

    static func signed(_ n: Int, first: Bool = false) -> String {
        if first { return String(n) }
        return n < 0 ? "− \(-n)" : "+ \(n)"
    }

    static func q(_ topic: String, _ prompt: String, _ answer: Int, spread: Int = 5, _ explanation: String? = nil) -> Question {
        .make(topicID: topic, prompt: prompt, answer: String(answer), distractors: near(answer, spread: spread),
              explanation: explanation, id: "\(topic)|\(UUID().uuidString)")
    }

    static func q(_ topic: String, _ prompt: String, _ answer: String, _ distractors: [String], _ explanation: String? = nil) -> Question {
        .make(topicID: topic, prompt: prompt, answer: answer, distractors: distractors,
              explanation: explanation, id: "\(topic)|\(UUID().uuidString)")
    }

    /// Coefficient as written in front of a variable: 1 → "", −1 → "−".
    static func co(_ a: Int) -> String { a == 1 ? "" : (a == -1 ? "−" : String(a)) }

    static func gcd(_ a: Int, _ b: Int) -> Int { b == 0 ? abs(a) : gcd(b, a % b) }

    static func fraction(_ n: Int, _ d: Int) -> String {
        let g = gcd(n, d)
        var (nn, dd) = (n / g, d / g)
        if dd < 0 { nn = -nn; dd = -dd }
        return dd == 1 ? "\(nn)" : "\(nn)/\(dd)"
    }
}

enum MathGenerators {
    // MARK: SAT Math — Algebra

    static let satMath: [(String, String, (String) -> Question)] = [
        ("sat.linear", "Linear Equations", { t in
            let x = Gen.r(-12...12), a = Gen.nonZero(-9...9), b = Gen.r(-20...20)
            let c = a * x + b
            return Gen.q(t, "If \(Gen.co(a))x \(Gen.signed(b)) = \(c), what is x?", x, "Subtract \(b) from both sides, then divide by \(a): x = \(x).")
        }),
        ("sat.linear2", "Equations with Variables on Both Sides", { t in
            let x = Gen.r(-10...10), a = Gen.r(3...9), c = Gen.r(1...(a - 1)), b = Gen.r(-15...15)
            let d = (a - c) * x + b
            return Gen.q(t, "Solve for x: \(a)x \(Gen.signed(b)) = \(Gen.co(c))x \(Gen.signed(d))", x,
                         "Move x terms together: \(a - c)x = \(d - b), so x = \(x).")
        }),
        ("sat.slope", "Slope Between Two Points", { t in
            let m = Gen.nonZero(-6...6), x1 = Gen.r(-8...8), dx = Gen.nonZero(-5...5), y1 = Gen.r(-10...10)
            let x2 = x1 + dx, y2 = y1 + m * dx
            return Gen.q(t, "What is the slope of the line through (\(x1), \(y1)) and (\(x2), \(y2))?", m, spread: 4,
                         "Slope = (y₂ − y₁)/(x₂ − x₁) = \(y2 - y1)/\(dx) = \(m).")
        }),
        ("sat.intercept", "Slope-Intercept Form", { t in
            let m = Gen.nonZero(-5...5), b = Gen.r(-10...10), x = Gen.r(-6...6)
            return Gen.q(t, "For y = \(Gen.co(m))x \(Gen.signed(b)), what is y when x = \(x)?", m * x + b, "y = \(m)(\(x)) \(Gen.signed(b)) = \(m * x + b).")
        }),
        ("sat.systems", "Systems of Equations", { t in
            let x = Gen.r(-6...6), y = Gen.r(-6...6)
            let a = Gen.nonZero(1...4), b = Gen.nonZero(1...4), c = Gen.nonZero(1...4), d = Gen.nonZero(-4...(-1))
            let e = a * x + b * y, f = c * x + d * y
            return Gen.q(t, "Given \(Gen.co(a))x + \(Gen.co(b))y = \(e) and \(Gen.co(c))x \(d == -1 ? "−" : Gen.signed(d))y = \(f), what is x + y?", x + y, spread: 4,
                         "Solving gives x = \(x), y = \(y), so x + y = \(x + y).")
        }),
        ("sat.inequality", "Linear Inequalities", { t in
            let a = Gen.r(2...7), x = Gen.r(-5...10), b = Gen.r(-10...10)
            let c = a * x + b
            return Gen.q(t, "What is the smallest integer x that satisfies \(a)x \(Gen.signed(b)) > \(c)?", x + 1, spread: 3,
                         "\(a)x > \(c - b) ⇒ x > \(x), so the smallest integer is \(x + 1).")
        }),
        ("sat.function", "Evaluating Functions", { t in
            let a = Gen.nonZero(-3...3), b = Gen.r(-6...6), c = Gen.r(-9...9), x = Gen.r(-4...4)
            let v = a * x * x + b * x + c
            return Gen.q(t, "If f(x) = \(a)x² \(Gen.signed(b))x \(Gen.signed(c)), what is f(\(x))?", v, spread: 8,
                         "Substitute x = \(x): \(a)(\(x * x)) \(Gen.signed(b * x)) \(Gen.signed(c)) = \(v).")
        }),
        ("sat.composition", "Function Composition", { t in
            let a = Gen.nonZero(-4...4), b = Gen.r(-5...5), c = Gen.nonZero(-3...3), d = Gen.r(-5...5), x = Gen.r(-4...4)
            let inner = c * x + d, v = a * inner + b
            return Gen.q(t, "f(x) = \(a)x \(Gen.signed(b)) and g(x) = \(c)x \(Gen.signed(d)). What is f(g(\(x)))?", v, spread: 7,
                         "g(\(x)) = \(inner), then f(\(inner)) = \(v).")
        }),
        ("sat.quadroots", "Quadratic Roots", { t in
            let p = Gen.r(-9...9), q = Gen.r(-9...9)
            let b = -(p + q), c = p * q
            return Gen.q(t, "What is the sum of the solutions of x² \(Gen.signed(b))x \(Gen.signed(c)) = 0?", p + q, spread: 5,
                         "Factor: (x − \(p))(x − \(q)) = 0. Sum of roots = −b/a = \(p + q).")
        }),
        ("sat.quadfactor", "Factoring Quadratics", { t in
            let p = Gen.nonZero(-9...9), q = Gen.nonZero(-9...9)
            let b = p + q, c = p * q
            func fac(_ a: Int, _ b: Int) -> String { "(x \(Gen.signed(a)))(x \(Gen.signed(b)))" }
            return Gen.q(t, "Which is equivalent to x² \(Gen.signed(b))x \(Gen.signed(c))?", fac(p, q),
                         [fac(-p, -q), fac(p, -q), fac(-p, q), fac(p + 1, q - 1)],
                         "Find two numbers that multiply to \(c) and add to \(b): \(p) and \(q).")
        }),
        ("sat.vertex", "Vertex of a Parabola", { t in
            let h = Gen.r(-6...6), k = Gen.r(-10...10), a = Gen.nonZero(-3...3)
            let b = -2 * a * h, c = a * h * h + k
            return Gen.q(t, "What is the x-coordinate of the vertex of y = \(a)x² \(Gen.signed(b))x \(Gen.signed(c))?", h, spread: 4,
                         "x = −b/(2a) = \(-b)/\(2 * a) = \(h).")
        }),
        ("sat.discriminant", "Discriminant & Number of Solutions", { t in
            let a = Gen.nonZero(1...4), b = Gen.r(-8...8), c = Gen.r(-6...8)
            let disc = b * b - 4 * a * c
            let ans = disc > 0 ? "2 real solutions" : (disc == 0 ? "1 real solution" : "No real solutions")
            return Gen.q(t, "How many real solutions does \(a)x² \(Gen.signed(b))x \(Gen.signed(c)) = 0 have?", ans,
                         ["2 real solutions", "1 real solution", "No real solutions", "Infinitely many"],
                         "Discriminant b² − 4ac = \(disc).")
        }),
        ("sat.exponents", "Exponent Rules", { t in
            let a = Gen.r(2...9), b = Gen.r(2...9), c = Gen.r(1...5)
            let ans = a + b - c
            return Gen.q(t, "If (x^\(a) · x^\(b)) / x^\(c) = x^n, what is n?", ans, spread: 4, "Add exponents when multiplying, subtract when dividing: \(a) + \(b) − \(c) = \(ans).")
        }),
        ("sat.radicals", "Radicals & Rational Exponents", { t in
            let base = Gen.r(2...5), root = [2, 3].randomElement()!, power = root * Gen.r(1...3)
            let value = Int(pow(Double(base), Double(power / root)))
            return Gen.q(t, "What is (\(Int(pow(Double(base), Double(power)))))^(1/\(root))?", value, spread: max(3, value / 3),
                         "The \(root == 2 ? "square" : "cube") root of \(base)^\(power) is \(base)^\(power / root) = \(value).")
        }),
        ("sat.percent", "Percentages", { t in
            let p = [5, 10, 12, 15, 20, 25, 30, 35, 40, 45, 60, 75, 80].randomElement()!, n = Gen.r(2...40) * 20
            let ans = p * n / 100
            return Gen.q(t, "What is \(p)% of \(n)?", ans, spread: max(4, ans / 5), "\(p)/100 × \(n) = \(ans).")
        }),
        ("sat.pctchange", "Percent Change", { t in
            let old = Gen.r(2...20) * 20, pct = [5, 10, 15, 20, 25, 40, 50].randomElement()!, up = Bool.random()
            let new = up ? old + old * pct / 100 : old - old * pct / 100
            return Gen.q(t, "A price changes from $\(old) to $\(new). What is the percent \(up ? "increase" : "decrease")?", "\(pct)%",
                         ["\(pct + 5)%", "\(max(1, pct - 5))%", "\(pct * 2)%", "\(pct + 10)%"],
                         "Change = \(abs(new - old)) ÷ \(old) = \(pct)%.")
        }),
        ("sat.ratio", "Ratios & Proportions", { t in
            let a = Gen.r(2...9), b = Gen.r(2...9), k = Gen.r(2...12)
            return Gen.q(t, "The ratio of boys to girls is \(a):\(b). If there are \(a * k) boys, how many girls are there?", b * k, spread: max(4, b),
                         "Scale factor = \(a * k)/\(a) = \(k); girls = \(b) × \(k) = \(b * k).")
        }),
        ("sat.rates", "Rates & Unit Conversion", { t in
            let mph = Gen.r(2...8) * 10, hours = Gen.r(2...6)
            return Gen.q(t, "A car travels at \(mph) miles per hour. How many miles does it travel in \(hours) hours\(hours > 3 ? "" : " and 30 minutes")?",
                         hours > 3 ? mph * hours : mph * hours + mph / 2, spread: 15,
                         "Distance = rate × time.")
        }),
        ("sat.stats", "Mean, Median & Range", { t in
            var nums = (0..<5).map { _ in Gen.r(1...30) }
            let rem = nums.reduce(0, +) % 5
            if rem != 0 { nums[4] += 5 - rem }
            nums.sort()
            let list = nums.shuffled().map(String.init).joined(separator: ", ")
            switch Gen.r(0...2) {
            case 0:
                let sum = nums.reduce(0, +)
                return Gen.q(t, "What is the mean of: \(list)?", sum / 5, spread: 4, "Sum = \(sum), divided by 5 = \(sum / 5).")
            case 1:
                return Gen.q(t, "What is the median of: \(list)?", nums[2], spread: 4, "Sorted: \(nums.map(String.init).joined(separator: ", ")). Middle value = \(nums[2]).")
            default:
                return Gen.q(t, "What is the range of: \(list)?", nums[4] - nums[0], spread: 5, "Max − min = \(nums[4]) − \(nums[0]).")
            }
        }),
        ("sat.probability", "Probability", { t in
            let red = Gen.r(1...9), blue = Gen.r(1...9), green = Gen.r(1...9)
            let total = red + blue + green
            let ans = Gen.fraction(red, total)
            return Gen.q(t, "A bag has \(red) red, \(blue) blue, and \(green) green marbles. What is the probability of drawing a red marble?", ans,
                         [Gen.fraction(blue, total), Gen.fraction(green, total), Gen.fraction(red, total + 1), Gen.fraction(red, blue + green),
                          Gen.fraction(red + 1, total + 1), Gen.fraction(total - red, total), "\(red)/\(total + 2)"],
                         "\(red) red out of \(total) total.")
        }),
        ("sat.pythag", "Pythagorean Theorem", { t in
            let triples = [(3, 4, 5), (5, 12, 13), (8, 15, 17), (7, 24, 25), (20, 21, 29), (9, 40, 41)]
            let (a, b, c) = triples.randomElement()!, k = Gen.r(1...3)
            if Bool.random() {
                return Gen.q(t, "A right triangle has legs \(a * k) and \(b * k). What is the hypotenuse?", c * k, spread: 4, "√(\(a * k)² + \(b * k)²) = \(c * k).")
            }
            return Gen.q(t, "A right triangle has hypotenuse \(c * k) and one leg \(a * k). What is the other leg?", b * k, spread: 4, "√(\(c * k)² − \(a * k)²) = \(b * k).")
        }),
        ("sat.triangles", "Angles & Triangles", { t in
            let a = Gen.r(20...80), b = Gen.r(20...(150 - a))
            return Gen.q(t, "Two angles of a triangle measure \(a)° and \(b)°. What is the third angle?", 180 - a - b, spread: 10, "Angles sum to 180°.")
        }),
        ("sat.circles", "Circles", { t in
            let r = Gen.r(2...12)
            if Bool.random() {
                return Gen.q(t, "What is the area of a circle with radius \(r)?", "\(r * r)π", ["\(2 * r)π", "\(r * r * 2)π", "\(r)π", "\(r * r + 1)π"], "A = πr² = \(r * r)π.")
            }
            return Gen.q(t, "What is the circumference of a circle with diameter \(2 * r)?", "\(2 * r)π", ["\(r)π", "\(r * r)π", "\(4 * r)π", "\(2 * r + 2)π"], "C = πd = \(2 * r)π.")
        }),
        ("sat.circleeq", "Circle Equations", { t in
            let h = Gen.r(-6...6), k = Gen.r(-6...6), r = Gen.r(1...9)
            func s(_ v: Int) -> String { v == 0 ? "" : (v > 0 ? " − \(v)" : " + \(-v)") }
            return Gen.q(t, "What is the radius of the circle (x\(s(h)))² + (y\(s(k)))² = \(r * r)?", r, spread: 3, "r² = \(r * r), so r = \(r).")
        }),
        ("sat.volume", "Area & Volume", { t in
            let l = Gen.r(2...12), w = Gen.r(2...12), h = Gen.r(2...12)
            return Gen.q(t, "What is the volume of a rectangular box that is \(l) × \(w) × \(h)?", l * w * h, spread: 20, "V = lwh = \(l * w * h).")
        }),
        ("sat.trig", "Right-Triangle Trigonometry", { t in
            let (a, b, c) = [(3, 4, 5), (5, 12, 13), (8, 15, 17), (7, 24, 25)].randomElement()!
            let which = Gen.r(0...2)
            let names = ["sin", "cos", "tan"]
            let answers = ["\(a)/\(c)", "\(b)/\(c)", "\(a)/\(b)"]
            let wrong = ["\(b)/\(a)", "\(c)/\(a)", "\(c)/\(b)", "\(b)/\(c)", "\(a)/\(c)", "\(a)/\(b)"]
            return Gen.q(t, "In a right triangle, the side opposite angle A is \(a), the adjacent side is \(b), and the hypotenuse is \(c). What is \(names[which])(A)?",
                         answers[which], wrong.shuffled(), "SOH-CAH-TOA.")
        }),
        ("sat.expgrowth", "Exponential Growth & Decay", { t in
            let start = Gen.r(1...9) * 100, rate = [2, 3].randomElement()!, periods = Gen.r(2...4)
            let ans = start * Int(pow(Double(rate), Double(periods)))
            return Gen.q(t, "A bacteria population starts at \(start) and \(rate == 2 ? "doubles" : "triples") every hour. How many are there after \(periods) hours?",
                         ans, spread: start, "\(start) × \(rate)^\(periods) = \(ans).")
        }),
        ("sat.abs", "Absolute Value", { t in
            let a = Gen.r(-10...10), b = Gen.r(1...12)
            return Gen.q(t, "What is the sum of all solutions to |x \(Gen.signed(-a))| = \(b)?", 2 * a, spread: 5,
                         "x = \(a + b) or x = \(a - b); sum = \(2 * a).")
        }),
    ]

    // MARK: General math

    static let general: [(String, String, (String) -> Question)] = [
        ("math.mental", "Mental Arithmetic", { t in
            let a = Gen.r(12...99), b = Gen.r(12...99)
            switch Gen.r(0...2) {
            case 0: return Gen.q(t, "\(a) + \(b) = ?", a + b, spread: 10)
            case 1: return Gen.q(t, "\(a + b) − \(b) = ?", a, spread: 10)
            default: return Gen.q(t, "\(a) × \(b % 12 + 2) = ?", a * (b % 12 + 2), spread: 12)
            }
        }),
        ("math.times", "Times Tables to 15", { t in
            let a = Gen.r(2...15), b = Gen.r(2...15)
            return Gen.q(t, "\(a) × \(b) = ?", a * b, spread: max(3, a))
        }),
        ("math.squares", "Squares & Square Roots", { t in
            let n = Gen.r(2...25)
            return Bool.random() ? Gen.q(t, "\(n)² = ?", n * n, spread: 2 * n) : Gen.q(t, "√\(n * n) = ?", n, spread: 3)
        }),
        ("math.fractions", "Fraction Arithmetic", { t in
            let a = Gen.r(1...9), b = Gen.r(2...9), c = Gen.r(1...9), d = Gen.r(2...9)
            let ans = Gen.fraction(a * d + c * b, b * d)
            return Gen.q(t, "\(a)/\(b) + \(c)/\(d) = ?", ans,
                         [Gen.fraction(a + c, b + d), Gen.fraction(a * c, b * d), Gen.fraction(a * d + c * b + 1, b * d), Gen.fraction(a * d - c * b, b * d),
                          Gen.fraction(a * d + c * b - 1, b * d), Gen.fraction(a * d + c * b + 2, b * d), Gen.fraction(a * d + c * b, b * d + 1)],
                         "Common denominator \(b * d): (\(a * d) + \(c * b))/\(b * d).")
        }),
        ("math.primes", "Prime Numbers", { t in
            func isPrime(_ n: Int) -> Bool { n > 1 && !(2..<max(2, Int(Double(n).squareRoot()) + 1)).contains { n % $0 == 0 && $0 != n } }
            let primes = (2...100).filter(isPrime), comps = (4...100).filter { !isPrime($0) && $0 % 2 == 1 }
            let p = primes.randomElement()!
            return Gen.q(t, "Which of these numbers is prime?", String(p), comps.shuffled().prefix(3).map(String.init))
        }),
        ("math.gcdlcm", "GCF & LCM", { t in
            let g = Gen.r(2...9), a = g * Gen.r(2...9), b = g * Gen.r(2...9)
            let gcd = Gen.gcd(a, b)
            if Bool.random() { return Gen.q(t, "What is the greatest common factor of \(a) and \(b)?", gcd, spread: 4) }
            return Gen.q(t, "What is the least common multiple of \(a) and \(b)?", a * b / gcd, spread: 12)
        }),
        ("math.sci", "Scientific Notation", { t in
            let m = Gen.r(11...99), e = Gen.r(3...9)
            let mant = Double(m) / 10
            return Gen.q(t, "Write \(m)\(String(repeating: "0", count: e - 1)) in scientific notation.", "\(Gen.fmt(mant)) × 10^\(e)",
                         ["\(Gen.fmt(mant)) × 10^\(e - 1)", "\(Gen.fmt(mant)) × 10^\(e + 1)", "\(m) × 10^\(e)", "\(Gen.fmt(mant / 10)) × 10^\(e)"])
        }),
        ("math.logs", "Logarithms", { t in
            let base = [2, 3, 5, 10].randomElement()!, e = Gen.r(1...(base == 2 ? 8 : 4))
            return Gen.q(t, "log base \(base) of \(Int(pow(Double(base), Double(e)))) = ?", e, spread: 3)
        }),
        ("math.derivative", "Derivatives (Power Rule)", { t in
            let a = Gen.nonZero(-9...9), n = Gen.r(2...7), x = Gen.r(-3...3)
            let ans = a * n * Int(pow(Double(x), Double(n - 1)))
            return Gen.q(t, "If f(x) = \(a)x^\(n), what is f′(\(x))?", ans, spread: max(5, abs(ans) / 4), "f′(x) = \(a * n)x^\(n - 1).")
        }),
        ("math.integral", "Definite Integrals", { t in
            let a = Gen.r(1...4), b = Gen.r(1...4)
            // ∫0..b of 3a x² dx = a b³
            return Gen.q(t, "∫ from 0 to \(b) of \(3 * a)x² dx = ?", a * b * b * b, spread: 10, "Antiderivative \(a)x³ evaluated at \(b).")
        }),
        ("math.binary", "Binary ↔ Decimal", { t in
            let n = Gen.r(5...255)
            if Bool.random() { return Gen.q(t, "Convert binary \(String(n, radix: 2)) to decimal.", n, spread: 8) }
            return Gen.q(t, "Convert \(n) to binary.", String(n, radix: 2),
                         [String(n + 1, radix: 2), String(max(1, n - 1), radix: 2), String(n ^ 4, radix: 2), String(n + 2, radix: 2)])
        }),
        ("math.hex", "Hexadecimal", { t in
            let n = Gen.r(16...255)
            return Gen.q(t, "Convert hex \(String(n, radix: 16).uppercased()) to decimal.", n, spread: 16)
        }),
        ("math.interest", "Simple & Compound Interest", { t in
            let p = Gen.r(1...20) * 100, r = Gen.r(2...10), y = Gen.r(2...5)
            return Gen.q(t, "Simple interest on $\(p) at \(r)% per year for \(y) years?", "$\(p * r * y / 100)",
                         ["$\(p * r / 100)", "$\(p * r * (y + 1) / 100)", "$\(p + p * r * y / 100)", "$\(p * r * y / 50)"], "I = Prt.")
        }),
        ("math.sequences", "Arithmetic & Geometric Sequences", { t in
            if Bool.random() {
                let a = Gen.r(-10...10), d = Gen.nonZero(-6...9), n = Gen.r(5...20)
                return Gen.q(t, "An arithmetic sequence starts \(a), \(a + d), \(a + 2 * d), … What is term \(n)?", a + (n - 1) * d, spread: max(3, abs(d)), "aₙ = a₁ + (n−1)d.")
            }
            let a = Gen.r(1...5), r = Gen.r(2...3), n = Gen.r(4...7)
            return Gen.q(t, "A geometric sequence starts \(a), \(a * r), \(a * r * r), … What is term \(n)?", a * Int(pow(Double(r), Double(n - 1))), spread: a * r * 2)
        }),
        ("math.combinatorics", "Permutations & Combinations", { t in
            let n = Gen.r(4...9), k = Gen.r(2...3)
            func fact(_ x: Int) -> Int { x <= 1 ? 1 : (2...x).reduce(1, *) }
            let c = fact(n) / (fact(k) * fact(n - k))
            if Bool.random() { return Gen.q(t, "How many ways can you choose \(k) people from \(n)?", c, spread: max(4, c / 3), "C(\(n),\(k)) = \(c).") }
            let p = fact(n) / fact(n - k)
            return Gen.q(t, "How many ways can \(k) medals (gold, silver, bronze…) go to \(n) runners?", p, spread: max(4, p / 3), "P(\(n),\(k)) = \(p).")
        }),
    ]
}

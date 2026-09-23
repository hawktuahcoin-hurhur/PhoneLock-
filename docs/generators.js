// Procedural question generators (JavaScript port of PhoneLock/Content/MathGenerators.swift).
// Every call returns a fresh question: { prompt, answer, wrong: [...], explanation }.
(function () {
  const r = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const nonZero = (a, b) => { let v = 0; while (v === 0) v = r(a, b); return v; };
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const signed = (n) => (n < 0 ? `− ${-n}` : `+ ${n}`);
  const co = (a) => (a === 1 ? "" : a === -1 ? "−" : String(a));
  const gcd = (a, b) => (b === 0 ? Math.abs(a) : gcd(b, a % b));
  const frac = (n, d) => { const g = gcd(n, d) || 1; let nn = n / g, dd = d / g; if (dd < 0) { nn = -nn; dd = -dd; } return dd === 1 ? `${nn}` : `${nn}/${dd}`; };
  const fmt = (x) => (Number.isInteger(x) ? String(x) : String(Number(x.toFixed(2))));
  const near = (ans, spread = 5) => {
    const out = new Set(); let guard = 0;
    while (out.size < 3 && guard++ < 100) { const d = ans + nonZero(-spread, spread); if (d !== ans) out.add(String(d)); }
    return [...out];
  };
  const num = (prompt, ans, spread, explanation) => ({ prompt, answer: String(ans), wrong: near(ans, spread), explanation });
  const txt = (prompt, answer, wrong, explanation) => ({ prompt, answer, wrong, explanation });

  const satMath = [
    ["sat.linear", "Linear Equations", () => {
      const x = r(-12, 12), a = nonZero(-9, 9), b = r(-20, 20), c = a * x + b;
      return num(`If ${co(a)}x ${signed(b)} = ${c}, what is x?`, x, 5, `Subtract ${b} from both sides, then divide by ${a}: x = ${x}.`);
    }],
    ["sat.linear2", "Equations with Variables on Both Sides", () => {
      const x = r(-10, 10), a = r(3, 9), c = r(1, a - 1), b = r(-15, 15), d = (a - c) * x + b;
      return num(`Solve for x: ${a}x ${signed(b)} = ${co(c)}x ${signed(d)}`, x, 5, `Move x terms together: ${a - c}x = ${d - b}, so x = ${x}.`);
    }],
    ["sat.slope", "Slope Between Two Points", () => {
      const m = nonZero(-6, 6), x1 = r(-8, 8), dx = nonZero(-5, 5), y1 = r(-10, 10), x2 = x1 + dx, y2 = y1 + m * dx;
      return num(`What is the slope of the line through (${x1}, ${y1}) and (${x2}, ${y2})?`, m, 4, `Slope = (y₂ − y₁)/(x₂ − x₁) = ${y2 - y1}/${dx} = ${m}.`);
    }],
    ["sat.intercept", "Slope-Intercept Form", () => {
      const m = nonZero(-5, 5), b = r(-10, 10), x = r(-6, 6);
      return num(`For y = ${co(m)}x ${signed(b)}, what is y when x = ${x}?`, m * x + b, 5, `y = ${m}(${x}) ${signed(b)} = ${m * x + b}.`);
    }],
    ["sat.systems", "Systems of Equations", () => {
      const x = r(-6, 6), y = r(-6, 6), a = r(1, 4), b = r(1, 4), c = r(1, 4), d = r(-4, -1);
      const e = a * x + b * y, f = c * x + d * y;
      return num(`Given ${co(a)}x + ${co(b)}y = ${e} and ${co(c)}x ${d === -1 ? "−" : signed(d)}y = ${f}, what is x + y?`, x + y, 4, `Solving gives x = ${x}, y = ${y}, so x + y = ${x + y}.`);
    }],
    ["sat.inequality", "Linear Inequalities", () => {
      const a = r(2, 7), x = r(-5, 10), b = r(-10, 10), c = a * x + b;
      return num(`What is the smallest integer x that satisfies ${a}x ${signed(b)} > ${c}?`, x + 1, 3, `${a}x > ${c - b} ⇒ x > ${x}, so the smallest integer is ${x + 1}.`);
    }],
    ["sat.function", "Evaluating Functions", () => {
      const a = nonZero(-3, 3), b = r(-6, 6), c = r(-9, 9), x = r(-4, 4), v = a * x * x + b * x + c;
      return num(`If f(x) = ${a}x² ${signed(b)}x ${signed(c)}, what is f(${x})?`, v, 8, `Substitute x = ${x}: ${a}(${x * x}) ${signed(b * x)} ${signed(c)} = ${v}.`);
    }],
    ["sat.composition", "Function Composition", () => {
      const a = nonZero(-4, 4), b = r(-5, 5), c = nonZero(-3, 3), d = r(-5, 5), x = r(-4, 4), inner = c * x + d, v = a * inner + b;
      return num(`f(x) = ${a}x ${signed(b)} and g(x) = ${c}x ${signed(d)}. What is f(g(${x}))?`, v, 7, `g(${x}) = ${inner}, then f(${inner}) = ${v}.`);
    }],
    ["sat.quadroots", "Quadratic Roots", () => {
      const p = r(-9, 9), q = r(-9, 9), b = -(p + q), c = p * q;
      return num(`What is the sum of the solutions of x² ${signed(b)}x ${signed(c)} = 0?`, p + q, 5, `Factor: (x − ${p})(x − ${q}) = 0. Sum of roots = −b/a = ${p + q}.`);
    }],
    ["sat.quadfactor", "Factoring Quadratics", () => {
      const p = nonZero(-9, 9), q = nonZero(-9, 9), b = p + q, c = p * q;
      const fac = (m, n) => `(x ${signed(m)})(x ${signed(n)})`;
      return txt(`Which is equivalent to x² ${signed(b)}x ${signed(c)}?`, fac(p, q), [fac(-p, -q), fac(p, -q), fac(-p, q), fac(p + 1, q - 1)], `Find two numbers that multiply to ${c} and add to ${b}: ${p} and ${q}.`);
    }],
    ["sat.vertex", "Vertex of a Parabola", () => {
      const h = r(-6, 6), k = r(-10, 10), a = nonZero(-3, 3), b = -2 * a * h, c = a * h * h + k;
      return num(`What is the x-coordinate of the vertex of y = ${a}x² ${signed(b)}x ${signed(c)}?`, h, 4, `x = −b/(2a) = ${-b}/${2 * a} = ${h}.`);
    }],
    ["sat.discriminant", "Discriminant & Number of Solutions", () => {
      const a = r(1, 4), b = r(-8, 8), c = r(-6, 8), disc = b * b - 4 * a * c;
      const ans = disc > 0 ? "2 real solutions" : disc === 0 ? "1 real solution" : "No real solutions";
      return txt(`How many real solutions does ${a}x² ${signed(b)}x ${signed(c)} = 0 have?`, ans, ["2 real solutions", "1 real solution", "No real solutions", "Infinitely many"], `Discriminant b² − 4ac = ${disc}.`);
    }],
    ["sat.exponents", "Exponent Rules", () => {
      const a = r(2, 9), b = r(2, 9), c = r(1, 5), ans = a + b - c;
      return num(`If (x^${a} · x^${b}) / x^${c} = x^n, what is n?`, ans, 4, `Add exponents when multiplying, subtract when dividing: ${a} + ${b} − ${c} = ${ans}.`);
    }],
    ["sat.radicals", "Radicals & Rational Exponents", () => {
      const base = r(2, 5), root = pick([2, 3]), power = root * r(1, 3), value = base ** (power / root);
      return num(`What is (${base ** power})^(1/${root})?`, value, Math.max(3, Math.floor(value / 3)), `The ${root === 2 ? "square" : "cube"} root of ${base}^${power} is ${base}^${power / root} = ${value}.`);
    }],
    ["sat.percent", "Percentages", () => {
      const p = pick([5, 10, 12, 15, 20, 25, 30, 35, 40, 45, 60, 75, 80]), n = r(2, 40) * 20, ans = (p * n) / 100;
      return num(`What is ${p}% of ${n}?`, ans, Math.max(4, Math.floor(ans / 5)), `${p}/100 × ${n} = ${ans}.`);
    }],
    ["sat.pctchange", "Percent Change", () => {
      const old = r(2, 20) * 20, pct = pick([5, 10, 15, 20, 25, 40, 50]), up = Math.random() < 0.5;
      const nw = up ? old + (old * pct) / 100 : old - (old * pct) / 100;
      return txt(`A price changes from $${old} to $${nw}. What is the percent ${up ? "increase" : "decrease"}?`, `${pct}%`, [`${pct + 5}%`, `${Math.max(1, pct - 5)}%`, `${pct * 2}%`, `${pct + 10}%`], `Change = ${Math.abs(nw - old)} ÷ ${old} = ${pct}%.`);
    }],
    ["sat.ratio", "Ratios & Proportions", () => {
      const a = r(2, 9), b = r(2, 9), k = r(2, 12);
      return num(`The ratio of boys to girls is ${a}:${b}. If there are ${a * k} boys, how many girls are there?`, b * k, Math.max(4, b), `Scale factor = ${a * k}/${a} = ${k}; girls = ${b} × ${k} = ${b * k}.`);
    }],
    ["sat.rates", "Rates & Unit Conversion", () => {
      const mph = r(2, 8) * 10, hours = r(2, 6);
      return num(`A car travels at ${mph} miles per hour. How many miles does it travel in ${hours} hours${hours > 3 ? "" : " and 30 minutes"}?`, hours > 3 ? mph * hours : mph * hours + mph / 2, 15, "Distance = rate × time.");
    }],
    ["sat.stats", "Mean, Median & Range", () => {
      const nums = Array.from({ length: 5 }, () => r(1, 30));
      const rem = nums.reduce((s, v) => s + v, 0) % 5;
      if (rem) nums[4] += 5 - rem;
      nums.sort((a, b) => a - b);
      const list = shuffle(nums).join(", "), sum = nums.reduce((s, v) => s + v, 0);
      switch (r(0, 2)) {
        case 0: return num(`What is the mean of: ${list}?`, sum / 5, 4, `Sum = ${sum}, divided by 5 = ${sum / 5}.`);
        case 1: return num(`What is the median of: ${list}?`, nums[2], 4, `Sorted: ${nums.join(", ")}. Middle value = ${nums[2]}.`);
        default: return num(`What is the range of: ${list}?`, nums[4] - nums[0], 5, `Max − min = ${nums[4]} − ${nums[0]}.`);
      }
    }],
    ["sat.probability", "Probability", () => {
      const red = r(1, 9), blue = r(1, 9), green = r(1, 9), total = red + blue + green;
      return txt(`A bag has ${red} red, ${blue} blue, and ${green} green marbles. What is the probability of drawing a red marble?`, frac(red, total),
        [frac(blue, total), frac(green, total), frac(red, total + 1), frac(red, blue + green), frac(red + 1, total + 1), frac(total - red, total), `${red}/${total + 2}`], `${red} red out of ${total} total.`);
    }],
    ["sat.pythag", "Pythagorean Theorem", () => {
      const [a, b, c] = pick([[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [20, 21, 29], [9, 40, 41]]), k = r(1, 3);
      if (Math.random() < 0.5) return num(`A right triangle has legs ${a * k} and ${b * k}. What is the hypotenuse?`, c * k, 4, `√(${a * k}² + ${b * k}²) = ${c * k}.`);
      return num(`A right triangle has hypotenuse ${c * k} and one leg ${a * k}. What is the other leg?`, b * k, 4, `√(${c * k}² − ${a * k}²) = ${b * k}.`);
    }],
    ["sat.triangles", "Angles & Triangles", () => {
      const a = r(20, 80), b = r(20, 150 - a);
      return num(`Two angles of a triangle measure ${a}° and ${b}°. What is the third angle?`, 180 - a - b, 10, "Angles in a triangle sum to 180°.");
    }],
    ["sat.circles", "Circles", () => {
      const rad = r(2, 12);
      if (Math.random() < 0.5) return txt(`What is the area of a circle with radius ${rad}?`, `${rad * rad}π`, [`${2 * rad}π`, `${rad * rad * 2}π`, `${rad}π`, `${rad * rad + 1}π`], `A = πr² = ${rad * rad}π.`);
      return txt(`What is the circumference of a circle with diameter ${2 * rad}?`, `${2 * rad}π`, [`${rad}π`, `${rad * rad}π`, `${4 * rad}π`, `${2 * rad + 2}π`], `C = πd = ${2 * rad}π.`);
    }],
    ["sat.circleeq", "Circle Equations", () => {
      const h = r(-6, 6), k = r(-6, 6), rad = r(1, 9);
      const s = (v) => (v === 0 ? "" : v > 0 ? ` − ${v}` : ` + ${-v}`);
      return num(`What is the radius of the circle (x${s(h)})² + (y${s(k)})² = ${rad * rad}?`, rad, 3, `r² = ${rad * rad}, so r = ${rad}.`);
    }],
    ["sat.volume", "Area & Volume", () => {
      const l = r(2, 12), w = r(2, 12), h = r(2, 12);
      return num(`What is the volume of a rectangular box that is ${l} × ${w} × ${h}?`, l * w * h, 20, `V = lwh = ${l * w * h}.`);
    }],
    ["sat.trig", "Right-Triangle Trigonometry", () => {
      const [a, b, c] = pick([[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25]]), which = r(0, 2);
      const names = ["sin", "cos", "tan"], answers = [`${a}/${c}`, `${b}/${c}`, `${a}/${b}`];
      return txt(`In a right triangle, the side opposite angle A is ${a}, the adjacent side is ${b}, and the hypotenuse is ${c}. What is ${names[which]}(A)?`, answers[which],
        shuffle([`${b}/${a}`, `${c}/${a}`, `${c}/${b}`, `${b}/${c}`, `${a}/${c}`, `${a}/${b}`]), "SOH-CAH-TOA.");
    }],
    ["sat.expgrowth", "Exponential Growth & Decay", () => {
      const start = r(1, 9) * 100, rate = pick([2, 3]), periods = r(2, 4), ans = start * rate ** periods;
      return num(`A bacteria population starts at ${start} and ${rate === 2 ? "doubles" : "triples"} every hour. How many are there after ${periods} hours?`, ans, start, `${start} × ${rate}^${periods} = ${ans}.`);
    }],
    ["sat.abs", "Absolute Value", () => {
      const a = r(-10, 10), b = r(1, 12);
      return num(`What is the sum of all solutions to |x ${signed(-a)}| = ${b}?`, 2 * a, 5, `x = ${a + b} or x = ${a - b}; sum = ${2 * a}.`);
    }],
  ];

  const isPrime = (n) => { if (n < 2) return false; for (let i = 2; i * i <= n; i++) if (n % i === 0) return false; return true; };
  const fact = (x) => (x <= 1 ? 1 : x * fact(x - 1));

  const general = [
    ["math.mental", "Mental Arithmetic", () => {
      const a = r(12, 99), b = r(12, 99);
      switch (r(0, 2)) {
        case 0: return num(`${a} + ${b} = ?`, a + b, 10);
        case 1: return num(`${a + b} − ${b} = ?`, a, 10);
        default: return num(`${a} × ${(b % 12) + 2} = ?`, a * ((b % 12) + 2), 12);
      }
    }],
    ["math.times", "Times Tables to 15", () => { const a = r(2, 15), b = r(2, 15); return num(`${a} × ${b} = ?`, a * b, Math.max(3, a)); }],
    ["math.squares", "Squares & Square Roots", () => { const n = r(2, 25); return Math.random() < 0.5 ? num(`${n}² = ?`, n * n, 2 * n) : num(`√${n * n} = ?`, n, 3); }],
    ["math.fractions", "Fraction Arithmetic", () => {
      const a = r(1, 9), b = r(2, 9), c = r(1, 9), d = r(2, 9), top = a * d + c * b;
      return txt(`${a}/${b} + ${c}/${d} = ?`, frac(top, b * d),
        [frac(a + c, b + d), frac(a * c, b * d), frac(top + 1, b * d), frac(a * d - c * b, b * d), frac(top - 1, b * d), frac(top + 2, b * d), frac(top, b * d + 1)],
        `Common denominator ${b * d}: (${a * d} + ${c * b})/${b * d}.`);
    }],
    ["math.primes", "Prime Numbers", () => {
      const primes = [], comps = [];
      for (let n = 2; n <= 100; n++) { if (isPrime(n)) primes.push(n); else if (n % 2 === 1) comps.push(n); }
      return txt("Which of these numbers is prime?", String(pick(primes)), shuffle(comps).slice(0, 3).map(String));
    }],
    ["math.gcdlcm", "GCF & LCM", () => {
      const g = r(2, 9), a = g * r(2, 9), b = g * r(2, 9), f = gcd(a, b);
      if (Math.random() < 0.5) return num(`What is the greatest common factor of ${a} and ${b}?`, f, 4);
      return num(`What is the least common multiple of ${a} and ${b}?`, (a * b) / f, 12);
    }],
    ["math.sci", "Scientific Notation", () => {
      const m = r(11, 99), e = r(3, 9), mant = m / 10;
      return txt(`Write ${m}${"0".repeat(e - 1)} in scientific notation.`, `${fmt(mant)} × 10^${e}`,
        [`${fmt(mant)} × 10^${e - 1}`, `${fmt(mant)} × 10^${e + 1}`, `${m} × 10^${e}`, `${fmt(mant / 10)} × 10^${e}`]);
    }],
    ["math.logs", "Logarithms", () => { const base = pick([2, 3, 5, 10]), e = r(1, base === 2 ? 8 : 4); return num(`log base ${base} of ${base ** e} = ?`, e, 3); }],
    ["math.derivative", "Derivatives (Power Rule)", () => {
      const a = nonZero(-9, 9), n = r(2, 7), x = r(-3, 3), ans = a * n * x ** (n - 1);
      return num(`If f(x) = ${a}x^${n}, what is f′(${x})?`, ans, Math.max(5, Math.floor(Math.abs(ans) / 4)), `f′(x) = ${a * n}x^${n - 1}.`);
    }],
    ["math.integral", "Definite Integrals", () => {
      const a = r(1, 4), b = r(1, 4);
      return num(`∫ from 0 to ${b} of ${3 * a}x² dx = ?`, a * b ** 3, 10, `Antiderivative ${a}x³ evaluated at ${b}.`);
    }],
    ["math.binary", "Binary ↔ Decimal", () => {
      const n = r(5, 255);
      if (Math.random() < 0.5) return num(`Convert binary ${n.toString(2)} to decimal.`, n, 8);
      return txt(`Convert ${n} to binary.`, n.toString(2), [(n + 1).toString(2), Math.max(1, n - 1).toString(2), (n ^ 4).toString(2), (n + 2).toString(2)]);
    }],
    ["math.hex", "Hexadecimal", () => { const n = r(16, 255); return num(`Convert hex ${n.toString(16).toUpperCase()} to decimal.`, n, 16); }],
    ["math.interest", "Simple & Compound Interest", () => {
      const p = r(1, 20) * 100, rate = r(2, 10), y = r(2, 5);
      return txt(`Simple interest on $${p} at ${rate}% per year for ${y} years?`, `$${(p * rate * y) / 100}`,
        [`$${(p * rate) / 100}`, `$${(p * rate * (y + 1)) / 100}`, `$${p + (p * rate * y) / 100}`, `$${(p * rate * y) / 50}`], "I = Prt.");
    }],
    ["math.sequences", "Arithmetic & Geometric Sequences", () => {
      if (Math.random() < 0.5) {
        const a = r(-10, 10), d = nonZero(-6, 9), n = r(5, 20);
        return num(`An arithmetic sequence starts ${a}, ${a + d}, ${a + 2 * d}, … What is term ${n}?`, a + (n - 1) * d, Math.max(3, Math.abs(d)), "aₙ = a₁ + (n−1)d.");
      }
      const a = r(1, 5), q = r(2, 3), n = r(4, 7);
      return num(`A geometric sequence starts ${a}, ${a * q}, ${a * q * q}, … What is term ${n}?`, a * q ** (n - 1), a * q * 2);
    }],
    ["math.combinatorics", "Permutations & Combinations", () => {
      const n = r(4, 9), k = r(2, 3), c = fact(n) / (fact(k) * fact(n - k));
      if (Math.random() < 0.5) return num(`How many ways can you choose ${k} people from ${n}?`, c, Math.max(4, Math.floor(c / 3)), `C(${n},${k}) = ${c}.`);
      const p = fact(n) / fact(n - k);
      return num(`How many ways can ${k} medals (gold, silver, bronze…) go to ${n} runners?`, p, Math.max(4, Math.floor(p / 3)), `P(${n},${k}) = ${p}.`);
    }],
  ];

  window.PL_GENERATORS = { satMath, general, shuffle, pick };
})();

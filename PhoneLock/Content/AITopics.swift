import Foundation

/// Topics whose questions are generated on demand by Claude (needs an Anthropic API key in Settings).
/// Add any line here — or type a custom topic in the app — to study anything.
enum AITopics {
    static let catalog: [(Subject, [String])] = [
        (.satMath, [
            "SAT Math: Hard Word Problems", "SAT Math: Nonlinear Functions", "SAT Math: Data Interpretation from Tables",
            "SAT Math: Scatterplots & Lines of Best Fit", "SAT Math: Two-Way Tables", "SAT Math: Equivalent Expressions",
            "SAT Math: Polynomial Division", "SAT Math: Rational Expressions", "SAT Math: Similar Triangles",
            "SAT Math: Arc Length & Sector Area", "SAT Math: Radians", "SAT Math: Complex Numbers",
            "SAT Math: Margin of Error & Sampling", "SAT Math: Hardest Desmos-Style Problems",
        ]),
        (.satReading, [
            "SAT R&W: Cross-Text Connections", "SAT R&W: Text Structure & Purpose", "SAT R&W: Command of Evidence (Quantitative)",
            "SAT R&W: Inferences", "SAT R&W: Rhetorical Synthesis (Notes)", "SAT R&W: Poetry Passages",
            "SAT R&W: Science Passages", "SAT R&W: History Passages", "SAT R&W: Hard Vocabulary in Context",
            "SAT R&W: Supplements & Appositives", "SAT R&W: Parallel Structure",
        ]),
        (.math, [
            "Pre-Algebra", "Algebra I", "Algebra II", "Geometry Proofs", "Trigonometric Identities", "Unit Circle",
            "Precalculus: Functions", "Conic Sections", "Limits", "Derivatives", "Chain Rule", "Related Rates",
            "Integrals", "Integration by Parts", "Series & Sequences", "Taylor Series", "Multivariable Calculus",
            "Linear Algebra: Matrices", "Eigenvalues & Eigenvectors", "Differential Equations", "Probability Theory",
            "Statistics: Hypothesis Testing", "Statistics: Confidence Intervals", "Discrete Math", "Number Theory",
            "Graph Theory", "Set Theory", "Logic & Proofs", "Vectors", "Complex Analysis Basics",
        ]),
        (.science, [
            "AP Biology: Cell Biology", "AP Biology: Genetics", "AP Biology: Evolution", "AP Biology: Ecology",
            "AP Biology: Cellular Respiration", "Molecular Biology", "Microbiology", "Immunology", "Neuroscience",
            "Human Physiology", "Botany", "Zoology", "Marine Biology", "AP Chemistry: Stoichiometry",
            "AP Chemistry: Thermodynamics", "AP Chemistry: Equilibrium", "AP Chemistry: Acids & Bases",
            "Organic Chemistry: Functional Groups", "Organic Chemistry: Reactions", "Biochemistry",
            "AP Physics 1: Kinematics", "AP Physics 1: Forces", "AP Physics 1: Energy & Momentum",
            "AP Physics 2: Fluids", "AP Physics C: Electricity & Magnetism", "Waves & Optics", "Thermodynamics",
            "Quantum Mechanics Basics", "Special Relativity", "Nuclear Physics", "Astronomy & Astrophysics",
            "Earth Science: Plate Tectonics", "Meteorology", "Oceanography", "Environmental Science",
            "Climate Science", "Geology: Rocks & Minerals", "Paleontology", "Genetics & CRISPR", "Epidemiology",
        ]),
        (.history, [
            "APUSH: Colonial America", "APUSH: American Revolution", "APUSH: Constitution & Early Republic",
            "APUSH: Jacksonian Era", "APUSH: Civil War & Reconstruction", "APUSH: Gilded Age", "APUSH: Progressive Era",
            "APUSH: 1920s & Great Depression", "APUSH: World War II", "APUSH: Cold War", "APUSH: Civil Rights Movement",
            "AP World: Classical Civilizations", "AP World: Silk Roads", "AP World: Mongol Empire", "AP World: Age of Exploration",
            "AP World: Industrial Revolution", "AP World: Imperialism", "AP World: Decolonization", "Ancient Egypt",
            "Ancient Greece", "Roman Republic & Empire", "Byzantine Empire", "Medieval Europe", "Renaissance",
            "Protestant Reformation", "French Revolution", "Napoleonic Era", "World War I", "Russian Revolution",
            "Holocaust", "Chinese Dynasties", "Japanese History", "Ottoman Empire", "History of India",
            "African Kingdoms", "Aztec, Maya & Inca", "Latin American Independence", "Space Race",
            "AP Gov: Constitution", "AP Gov: Supreme Court Cases", "AP Gov: Congress", "AP Gov: The Presidency",
            "Landmark Supreme Court Cases", "Comparative Government",
        ]),
        (.geography, [
            "World Flags", "Rivers of the World", "Mountain Ranges", "Deserts", "Countries by Population",
            "European Geography", "Asian Geography", "African Geography", "South American Geography",
            "U.S. Geography", "Human Geography: Urbanization", "Human Geography: Migration", "Climate Zones",
            "Time Zones & Map Projections", "World Religions", "World Languages",
        ]),
        (.languages, [
            "Spanish Grammar: Preterite vs Imperfect", "Spanish Subjunctive", "Spanish Travel Phrases",
            "French Grammar: Passé Composé", "French Subjunctive", "German Cases", "Italian Basics",
            "Portuguese Basics", "Japanese Hiragana", "Japanese Katakana", "Japanese N5 Vocabulary",
            "Mandarin HSK 1", "Mandarin HSK 2", "Korean Hangul", "Korean Basics", "Arabic Basics",
            "Russian Basics", "Latin Grammar", "ASL Basics", "English Grammar", "Commonly Confused Words",
            "Idioms & Expressions", "Etymology",
        ]),
        (.vocab, [
            "GRE Vocabulary", "ACT English", "Advanced Vocabulary", "Words from Literature", "Business Vocabulary",
            "Medical Terminology", "Legal Terminology",
        ]),
        (.humanities, [
            "AP English Literature", "AP English Language: Rhetoric", "Shakespeare", "Greek Tragedy", "Poetry & Poets",
            "American Literature", "British Literature", "World Literature", "Russian Literature", "Mythology: Norse",
            "Mythology: Egyptian", "Art History: Renaissance", "Art History: Impressionism", "Art History: Modern Art",
            "Architecture", "Classical Music", "Music Theory", "Jazz History", "Film History", "Philosophy: Ethics",
            "Philosophy: Epistemology", "Philosophy: Existentialism", "Logic & Fallacies", "Religious Studies",
            "Theater",
        ]),
        (.tech, [
            "AP Computer Science A (Java)", "AP CS Principles", "Data Structures", "Algorithms", "Dynamic Programming",
            "Graph Algorithms", "Python Programming", "JavaScript", "Swift & iOS", "SQL & Databases",
            "Operating Systems", "Computer Networks", "Cybersecurity", "Cryptography", "Machine Learning",
            "Deep Learning", "Computer Architecture", "Git & Version Control", "Linux Command Line",
            "System Design", "Web Development", "Cloud Computing", "Theory of Computation",
        ]),
        (.social, [
            "AP Psychology: Biological Bases", "AP Psychology: Cognition", "AP Psychology: Development",
            "AP Psychology: Disorders & Treatment", "Social Psychology", "Sociology", "Anthropology",
            "Cognitive Biases", "Research Methods", "Criminology", "Linguistics", "Education Theory",
        ]),
        (.business, [
            "AP Microeconomics", "AP Macroeconomics", "Accounting Basics", "Corporate Finance", "Investing",
            "Stock Market", "Marketing", "Entrepreneurship", "Business Law", "Negotiation", "Game Theory",
            "Behavioral Economics", "International Trade", "Cryptocurrency & Blockchain", "Real Estate Basics",
            "Taxes 101",
        ]),
    ]
}

import Foundation

/// Built-in flashcard decks. Each line is "front|back". Decks become multiple-choice questions
/// whose distractors come from the other cards in the same deck.
enum Decks {
    struct Entry {
        let id: String
        let name: String
        let subject: Subject
        let forward: String
        let reverse: String?
        let raw: String
    }

    static func parse(_ raw: String) -> [[String]] {
        raw.split(separator: "\n").compactMap { line in
            let parts = line.split(separator: "|", maxSplits: 1).map { $0.trimmingCharacters(in: .whitespaces) }
            return parts.count == 2 && !parts[0].isEmpty && !parts[1].isEmpty ? parts : nil
        }
    }

    /// Splits a big list into numbered decks of `size` cards so each topic stays bite-sized.
    static func chunked(id: String, name: String, subject: Subject, forward: String, reverse: String?, raw: String, size: Int) -> [(String, String, Subject, Deck)] {
        let pairs = parse(raw)
        let chunks = stride(from: 0, to: pairs.count, by: size).map { Array(pairs[$0..<min($0 + size, pairs.count)]) }
        return chunks.enumerated().map { i, chunk in
            ("\(id).\(i + 1)", chunks.count > 1 ? "\(name) \(roman(i + 1))" : name, subject, Deck(forward: forward, reverse: reverse, pairs: chunk))
        }
    }

    private static func roman(_ n: Int) -> String {
        ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"][min(n, 10) - 1]
    }

    static var all: [(String, String, Subject, Deck)] {
        var out: [(String, String, Subject, Deck)] = []
        out += chunked(id: "sat.vocab", name: "SAT Vocab", subject: .vocab, forward: "What does “%@” mean?", reverse: "Which word means: %@?", raw: satVocab, size: 20)
        out += chunked(id: "vocab.roots", name: "Greek & Latin Roots", subject: .vocab, forward: "What does the root “%@” mean?", reverse: "Which root means “%@”?", raw: roots, size: 20)
        for (id, name, raw) in capitals {
            out.append((id, name, .geography, Deck(forward: "What is the capital of %@?", reverse: "%@ is the capital of…", pairs: parse(raw))))
        }
        out += chunked(id: "geo.states", name: "U.S. State Capitals", subject: .geography, forward: "What is the capital of %@?", reverse: "%@ is the capital of which state?", raw: stateCapitals, size: 25)
        out.append(("geo.landmarks", "World Landmarks", .geography, Deck(forward: "In which country is %@?", reverse: nil, pairs: parse(landmarks))))
        out += chunked(id: "sci.elements", name: "Chemical Elements", subject: .science, forward: "What is the symbol for %@?", reverse: "Which element has the symbol %@?", raw: elements, size: 20)
        out.append(("sci.bio", "Biology Essentials", .science, Deck(forward: "What is %@?", reverse: "Which term matches: %@", pairs: parse(biology))))
        out.append(("sci.chem", "Chemistry Concepts", .science, Deck(forward: "What is %@?", reverse: "Which term matches: %@", pairs: parse(chemistry))))
        out.append(("sci.physics", "Physics Units & Laws", .science, Deck(forward: "What is %@?", reverse: "Which term matches: %@", pairs: parse(physics))))
        out.append(("sci.anatomy", "Human Anatomy", .science, Deck(forward: "What is the job of the %@?", reverse: "Which organ or structure: %@", pairs: parse(anatomy))))
        out.append(("sci.space", "Astronomy", .science, Deck(forward: "%@", reverse: nil, pairs: parse(astronomy))))
        out.append(("hist.us", "U.S. History Dates", .history, Deck(forward: "In what year: %@?", reverse: nil, pairs: parse(usHistory))))
        out.append(("hist.world", "World History Dates", .history, Deck(forward: "In what year: %@?", reverse: nil, pairs: parse(worldHistory))))
        out.append(("hist.presidents", "U.S. Presidents 1–20", .history, Deck(forward: "Who was U.S. President #%@?", reverse: "%@ was President number…", pairs: parse(presidents))))
        out.append(("hist.civics", "Civics & Government", .history, Deck(forward: "What is %@?", reverse: "Which term matches: %@", pairs: parse(civics))))
        out += chunked(id: "lang.es", name: "Spanish Vocab", subject: .languages, forward: "What does “%@” mean?", reverse: "How do you say “%@” in Spanish?", raw: spanish, size: 25)
        out.append(("lang.fr", "French Vocab", .languages, Deck(forward: "What does “%@” mean?", reverse: "How do you say “%@” in French?", pairs: parse(french))))
        out.append(("lang.de", "German Vocab", .languages, Deck(forward: "What does “%@” mean?", reverse: "How do you say “%@” in German?", pairs: parse(german))))
        out.append(("hum.lit", "Literature: Who Wrote It?", .humanities, Deck(forward: "Who wrote “%@”?", reverse: "Which work is by %@?", pairs: parse(literature))))
        out.append(("hum.art", "Famous Artworks", .humanities, Deck(forward: "Who created “%@”?", reverse: "Which work is by %@?", pairs: parse(art))))
        out.append(("hum.myth", "Greek Mythology", .humanities, Deck(forward: "What is %@ the god/goddess of?", reverse: "Who is the Greek deity of %@?", pairs: parse(mythology))))
        out.append(("hum.philo", "Philosophers", .humanities, Deck(forward: "Which idea is %@ known for?", reverse: "Who is known for: %@?", pairs: parse(philosophers))))
        out.append(("hum.lit.devices", "Literary Devices", .humanities, Deck(forward: "What is %@?", reverse: "Which device: %@", pairs: parse(literaryDevices))))
        out.append(("tech.cs", "CS Fundamentals", .tech, Deck(forward: "What is %@?", reverse: "Which term matches: %@", pairs: parse(computerScience))))
        out.append(("tech.bigo", "Big-O Complexity", .tech, Deck(forward: "What is the typical time complexity of %@?", reverse: nil, pairs: parse(bigO))))
        out.append(("soc.psych", "Psychology Terms", .social, Deck(forward: "What is %@?", reverse: "Which term matches: %@", pairs: parse(psychology))))
        out.append(("biz.econ", "Economics Terms", .business, Deck(forward: "What is %@?", reverse: "Which term matches: %@", pairs: parse(economics))))
        out.append(("biz.finance", "Personal Finance", .business, Deck(forward: "What is %@?", reverse: "Which term matches: %@", pairs: parse(finance))))
        return out
    }

    // MARK: - Data

    static let satVocab = """
    abate|to become less intense
    aberration|a departure from what is normal
    abstruse|difficult to understand
    acquiesce|to accept reluctantly without protest
    acrimonious|angry and bitter
    adroit|skillful and clever
    aesthetic|concerned with beauty
    alacrity|brisk and cheerful readiness
    ambivalent|having mixed feelings
    ameliorate|to make something better
    anachronistic|out of its proper time period
    anomaly|something that deviates from the norm
    antithesis|the direct opposite
    apathy|lack of interest or concern
    arbitrary|based on random choice, not reason
    arduous|requiring great effort
    articulate|able to express ideas clearly
    ascetic|practicing severe self-discipline
    assuage|to make an unpleasant feeling less intense
    audacious|showing bold willingness to take risks
    austere|severe or strict in manner; plain
    banal|lacking originality; boring
    belligerent|hostile and aggressive
    benevolent|well-meaning and kindly
    bolster|to support or strengthen
    brevity|concise use of words
    cacophony|a harsh mixture of sounds
    candor|the quality of being open and honest
    capricious|given to sudden changes of mood
    catalyst|something that causes change
    circumspect|wary and unwilling to take risks
    coalesce|to come together to form one whole
    cogent|clear, logical, and convincing
    complacent|smugly satisfied; unaware of danger
    concede|to admit something is true after first denying it
    conciliatory|intended to make peace
    conundrum|a confusing and difficult problem
    corroborate|to confirm or give support to
    credulous|too ready to believe things
    culpable|deserving blame
    dearth|a scarcity or lack
    deference|humble submission and respect
    delineate|to describe or portray precisely
    denigrate|to criticize unfairly; disparage
    diligent|showing care and effort in work
    discern|to perceive or recognize
    disparate|essentially different in kind
    dogmatic|stating opinions as undeniably true
    eclectic|drawn from diverse sources
    efficacy|the ability to produce a desired result
    elusive|difficult to find or catch
    empirical|based on observation or experience
    ephemeral|lasting a very short time
    equivocal|open to more than one interpretation
    erudite|having great knowledge
    exacerbate|to make a problem worse
    exemplary|serving as a desirable model
    extol|to praise enthusiastically
    fastidious|very attentive to detail
    fervent|having intense feeling
    frugal|sparing or economical with money
    garrulous|excessively talkative
    gregarious|fond of company; sociable
    hackneyed|overused and unoriginal
    hubris|excessive pride or self-confidence
    iconoclast|a person who attacks cherished beliefs
    impetuous|acting quickly without thought
    incisive|intelligently analytical and clear
    indifferent|having no particular interest
    innocuous|not harmful or offensive
    intrepid|fearless; adventurous
    laconic|using very few words
    lethargic|sluggish and apathetic
    lucid|expressed clearly; easy to understand
    magnanimous|generous and forgiving
    malleable|easily influenced or shaped
    meticulous|showing great attention to detail
    mitigate|to make less severe
    mundane|lacking interest; ordinary
    nefarious|wicked or criminal
    novice|a person new to an activity
    obdurate|stubbornly refusing to change
    obsolete|no longer produced or used
    opulent|ostentatiously rich and luxurious
    paradigm|a typical example or model
    paucity|the presence of something in small amounts
    pragmatic|dealing with things practically
    precocious|developed abilities at an early age
    prolific|producing much fruit or many works
    prosaic|lacking poetic beauty; dull
    quandary|a state of uncertainty over what to do
    rancor|bitterness or resentfulness
    recalcitrant|uncooperative toward authority
    reticent|not revealing one's thoughts readily
    reverent|feeling deep respect
    sagacious|having good judgment; wise
    scrupulous|diligent and extremely careful
    soporific|tending to induce sleep
    spurious|false or fake
    stoic|enduring pain without complaint
    substantiate|to provide evidence to support
    superfluous|unnecessary; more than enough
    tenacious|persistent; not giving up
    tenuous|very weak or slight
    ubiquitous|present everywhere
    undermine|to weaken gradually
    vacillate|to waver between opinions
    venerate|to regard with great respect
    verbose|using more words than needed
    vindicate|to clear of blame
    volatile|liable to change rapidly
    zealous|having great energy for a cause
    """

    static let roots = """
    bene|good, well
    mal|bad
    chron|time
    graph|write
    phil|love
    phob|fear
    bio|life
    geo|earth
    hydr|water
    therm|heat
    tele|far
    micro|small
    port|carry
    dict|say, speak
    spect|look, see
    scrib|write
    rupt|break
    tract|pull, drag
    ject|throw
    vid|see
    aud|hear
    cred|believe
    fid|faith, trust
    loqu|speak, talk
    omni|all
    pan|all, every
    anthrop|human
    path|feeling, suffering
    morph|shape, form
    ambi|both
    """

    static let capitals: [(String, String, String)] = [
        ("geo.cap.europe", "Capitals: Europe", """
        France|Paris
        Germany|Berlin
        Italy|Rome
        Spain|Madrid
        Portugal|Lisbon
        Netherlands|Amsterdam
        Belgium|Brussels
        Switzerland|Bern
        Austria|Vienna
        Poland|Warsaw
        Czech Republic|Prague
        Hungary|Budapest
        Greece|Athens
        Sweden|Stockholm
        Norway|Oslo
        Denmark|Copenhagen
        Finland|Helsinki
        Ireland|Dublin
        United Kingdom|London
        Ukraine|Kyiv
        Romania|Bucharest
        Bulgaria|Sofia
        Croatia|Zagreb
        Serbia|Belgrade
        Iceland|Reykjavík
        Estonia|Tallinn
        Latvia|Riga
        Lithuania|Vilnius
        Slovakia|Bratislava
        Slovenia|Ljubljana
        """),
        ("geo.cap.asia", "Capitals: Asia & Middle East", """
        Japan|Tokyo
        China|Beijing
        South Korea|Seoul
        India|New Delhi
        Pakistan|Islamabad
        Bangladesh|Dhaka
        Thailand|Bangkok
        Vietnam|Hanoi
        Philippines|Manila
        Indonesia|Jakarta
        Malaysia|Kuala Lumpur
        Mongolia|Ulaanbaatar
        Nepal|Kathmandu
        Afghanistan|Kabul
        Iran|Tehran
        Iraq|Baghdad
        Saudi Arabia|Riyadh
        Israel|Jerusalem
        Jordan|Amman
        Syria|Damascus
        Lebanon|Beirut
        Turkey|Ankara
        Kazakhstan|Astana
        Uzbekistan|Tashkent
        Qatar|Doha
        United Arab Emirates|Abu Dhabi
        Sri Lanka|Sri Jayawardenepura Kotte
        Myanmar|Naypyidaw
        Cambodia|Phnom Penh
        Laos|Vientiane
        """),
        ("geo.cap.africa", "Capitals: Africa", """
        Egypt|Cairo
        Nigeria|Abuja
        Kenya|Nairobi
        Ethiopia|Addis Ababa
        Ghana|Accra
        Morocco|Rabat
        Algeria|Algiers
        Tunisia|Tunis
        Libya|Tripoli
        Sudan|Khartoum
        Uganda|Kampala
        Tanzania|Dodoma
        Rwanda|Kigali
        Senegal|Dakar
        Mali|Bamako
        Zimbabwe|Harare
        Zambia|Lusaka
        Angola|Luanda
        Mozambique|Maputo
        Madagascar|Antananarivo
        Cameroon|Yaoundé
        Somalia|Mogadishu
        Botswana|Gaborone
        Namibia|Windhoek
        Democratic Republic of the Congo|Kinshasa
        """),
        ("geo.cap.americas", "Capitals: The Americas", """
        United States|Washington, D.C.
        Canada|Ottawa
        Mexico|Mexico City
        Brazil|Brasília
        Argentina|Buenos Aires
        Chile|Santiago
        Peru|Lima
        Colombia|Bogotá
        Venezuela|Caracas
        Ecuador|Quito
        Bolivia|Sucre
        Paraguay|Asunción
        Uruguay|Montevideo
        Cuba|Havana
        Jamaica|Kingston
        Haiti|Port-au-Prince
        Dominican Republic|Santo Domingo
        Guatemala|Guatemala City
        Honduras|Tegucigalpa
        Nicaragua|Managua
        Costa Rica|San José
        Panama|Panama City
        El Salvador|San Salvador
        Bahamas|Nassau
        Guyana|Georgetown
        """),
        ("geo.cap.oceania", "Capitals: Oceania", """
        Australia|Canberra
        New Zealand|Wellington
        Fiji|Suva
        Papua New Guinea|Port Moresby
        Samoa|Apia
        Tonga|Nukuʻalofa
        Vanuatu|Port Vila
        Solomon Islands|Honiara
        Palau|Ngerulmud
        Kiribati|South Tarawa
        """),
    ]

    static let stateCapitals = """
    Alabama|Montgomery
    Alaska|Juneau
    Arizona|Phoenix
    Arkansas|Little Rock
    California|Sacramento
    Colorado|Denver
    Connecticut|Hartford
    Delaware|Dover
    Florida|Tallahassee
    Georgia|Atlanta
    Hawaii|Honolulu
    Idaho|Boise
    Illinois|Springfield
    Indiana|Indianapolis
    Iowa|Des Moines
    Kansas|Topeka
    Kentucky|Frankfort
    Louisiana|Baton Rouge
    Maine|Augusta
    Maryland|Annapolis
    Massachusetts|Boston
    Michigan|Lansing
    Minnesota|Saint Paul
    Mississippi|Jackson
    Missouri|Jefferson City
    Montana|Helena
    Nebraska|Lincoln
    Nevada|Carson City
    New Hampshire|Concord
    New Jersey|Trenton
    New Mexico|Santa Fe
    New York|Albany
    North Carolina|Raleigh
    North Dakota|Bismarck
    Ohio|Columbus
    Oklahoma|Oklahoma City
    Oregon|Salem
    Pennsylvania|Harrisburg
    Rhode Island|Providence
    South Carolina|Columbia
    South Dakota|Pierre
    Tennessee|Nashville
    Texas|Austin
    Utah|Salt Lake City
    Vermont|Montpelier
    Virginia|Richmond
    Washington|Olympia
    West Virginia|Charleston
    Wisconsin|Madison
    Wyoming|Cheyenne
    """

    static let landmarks = """
    Machu Picchu|Peru
    the Taj Mahal|India
    Petra|Jordan
    Angkor Wat|Cambodia
    Chichén Itzá|Mexico
    the Colosseum|Italy
    Christ the Redeemer|Brazil
    the Great Wall|China
    Stonehenge|United Kingdom
    the Acropolis|Greece
    the Sagrada Família|Spain
    the Sydney Opera House|Australia
    Mount Kilimanjaro|Tanzania
    the Great Pyramid of Giza|Egypt
    Neuschwanstein Castle|Germany
    Mount Fuji|Japan
    Easter Island's moai|Chile
    the Hagia Sophia|Turkey
    Table Mountain|South Africa
    the Burj Khalifa|United Arab Emirates
    """

    static let elements = """
    Hydrogen|H
    Helium|He
    Lithium|Li
    Beryllium|Be
    Boron|B
    Carbon|C
    Nitrogen|N
    Oxygen|O
    Fluorine|F
    Neon|Ne
    Sodium|Na
    Magnesium|Mg
    Aluminum|Al
    Silicon|Si
    Phosphorus|P
    Sulfur|S
    Chlorine|Cl
    Argon|Ar
    Potassium|K
    Calcium|Ca
    Titanium|Ti
    Chromium|Cr
    Manganese|Mn
    Iron|Fe
    Cobalt|Co
    Nickel|Ni
    Copper|Cu
    Zinc|Zn
    Arsenic|As
    Bromine|Br
    Krypton|Kr
    Silver|Ag
    Tin|Sn
    Iodine|I
    Xenon|Xe
    Platinum|Pt
    Gold|Au
    Mercury|Hg
    Lead|Pb
    Uranium|U
    """

    static let biology = """
    mitochondria|the organelle that produces most of the cell's ATP
    ribosome|the structure that synthesizes proteins
    photosynthesis|converting light, water, and CO₂ into glucose and oxygen
    osmosis|diffusion of water across a semipermeable membrane
    mitosis|cell division producing two identical daughter cells
    meiosis|cell division producing four gametes with half the chromosomes
    DNA|the double-helix molecule that stores genetic information
    enzyme|a protein that speeds up chemical reactions
    homeostasis|maintaining a stable internal environment
    allele|a variant form of a gene
    genotype|an organism's genetic makeup
    phenotype|an organism's observable traits
    natural selection|differential survival and reproduction of better-adapted organisms
    chloroplast|the organelle where photosynthesis occurs
    nucleus|the organelle containing most of a eukaryotic cell's DNA
    prokaryote|a single-celled organism without a nucleus
    ecosystem|a community of organisms interacting with their environment
    producer|an organism that makes its own food
    transcription|copying DNA into messenger RNA
    translation|building a protein from an mRNA sequence
    """

    static let chemistry = """
    an isotope|atoms of an element with different numbers of neutrons
    a mole|6.022 × 10²³ particles of a substance
    pH|a measure of hydrogen-ion concentration (acidity)
    a covalent bond|a bond formed by sharing electrons
    an ionic bond|a bond formed by transfer of electrons
    a catalyst|a substance that speeds a reaction without being consumed
    oxidation|loss of electrons
    reduction|gain of electrons
    an exothermic reaction|a reaction that releases heat
    an endothermic reaction|a reaction that absorbs heat
    electronegativity|an atom's tendency to attract bonding electrons
    a noble gas|an unreactive element in group 18
    molarity|moles of solute per liter of solution
    an alkali metal|a highly reactive element in group 1
    sublimation|a solid turning directly into a gas
    """

    static let physics = """
    the newton|the SI unit of force
    the joule|the SI unit of energy
    the watt|the SI unit of power
    the pascal|the SI unit of pressure
    the ohm|the SI unit of electrical resistance
    Newton's first law|an object stays at rest or in motion unless acted on by a net force
    Newton's second law|force equals mass times acceleration
    Newton's third law|every action has an equal and opposite reaction
    Ohm's law|voltage equals current times resistance
    kinetic energy|energy of motion, ½mv²
    potential energy|stored energy due to position
    momentum|mass times velocity
    frequency|number of wave cycles per second
    velocity|speed in a given direction
    acceleration|rate of change of velocity
    """

    static let anatomy = """
    heart|pumps blood through the body
    lungs|exchange oxygen and carbon dioxide
    liver|detoxifies blood and produces bile
    kidneys|filter blood and produce urine
    pancreas|produces insulin and digestive enzymes
    small intestine|absorbs most nutrients from food
    large intestine|absorbs water and forms feces
    stomach|breaks down food with acid and enzymes
    brain|controls the nervous system
    skin|the largest organ; protects the body
    spleen|filters blood and supports immunity
    thyroid|regulates metabolism with hormones
    femur|the longest bone in the human body
    diaphragm|the muscle that drives breathing
    """

    static let astronomy = """
    Which planet is closest to the Sun?|Mercury
    Which planet is the largest?|Jupiter
    Which planet has the most prominent rings?|Saturn
    Which planet is known as the Red Planet?|Mars
    Which planet rotates on its side?|Uranus
    Which planet is the hottest?|Venus
    Which planet is farthest from the Sun?|Neptune
    What is the closest star to Earth?|The Sun
    What galaxy do we live in?|The Milky Way
    What is the largest moon in the solar system?|Ganymede
    What is a light-year a measure of?|Distance
    What force keeps planets in orbit?|Gravity
    """

    static let usHistory = """
    the Declaration of Independence was signed|1776
    the U.S. Constitution was written|1787
    the Louisiana Purchase occurred|1803
    the Civil War began|1861
    the Emancipation Proclamation was issued|1863
    the Civil War ended|1865
    women won the right to vote (19th Amendment)|1920
    the stock market crashed, starting the Great Depression|1929
    Pearl Harbor was attacked|1941
    Brown v. Board of Education was decided|1954
    the Civil Rights Act was passed|1964
    Apollo 11 landed on the Moon|1969
    the September 11 attacks occurred|2001
    the War of 1812 began|1812
    Columbus first reached the Americas|1492
    Jamestown was founded|1607
    """

    static let worldHistory = """
    the Western Roman Empire fell|476
    the Magna Carta was signed|1215
    the printing press was invented by Gutenberg (approx.)|1440
    the French Revolution began|1789
    World War I began|1914
    the Russian Revolution occurred|1917
    World War II began|1939
    World War II ended|1945
    the United Nations was founded|1945
    India gained independence|1947
    the Berlin Wall fell|1989
    the Soviet Union dissolved|1991
    Constantinople fell to the Ottomans|1453
    the Protestant Reformation began|1517
    Napoleon was defeated at Waterloo|1815
    """

    static let presidents = """
    1|George Washington
    2|John Adams
    3|Thomas Jefferson
    4|James Madison
    5|James Monroe
    6|John Quincy Adams
    7|Andrew Jackson
    8|Martin Van Buren
    9|William Henry Harrison
    10|John Tyler
    11|James K. Polk
    12|Zachary Taylor
    13|Millard Fillmore
    14|Franklin Pierce
    15|James Buchanan
    16|Abraham Lincoln
    17|Andrew Johnson
    18|Ulysses S. Grant
    19|Rutherford B. Hayes
    20|James A. Garfield
    """

    static let civics = """
    checks and balances|each branch of government can limit the others
    federalism|power divided between national and state governments
    judicial review|courts can strike down unconstitutional laws
    the Bill of Rights|the first ten amendments to the Constitution
    a filibuster|prolonged debate used to delay a Senate vote
    a veto|the president's rejection of a bill
    the Electoral College|the body that formally elects the U.S. president
    impeachment|the House bringing charges against an official
    due process|fair legal procedures before depriving rights
    popular sovereignty|the idea that government power comes from the people
    separation of powers|dividing government into legislative, executive, and judicial branches
    a bicameral legislature|a lawmaking body with two chambers
    """

    static let spanish = """
    hola|hello
    adiós|goodbye
    gracias|thank you
    por favor|please
    perro|dog
    gato|cat
    casa|house
    agua|water
    comida|food
    libro|book
    escuela|school
    amigo|friend
    familia|family
    ciudad|city
    tiempo|time / weather
    trabajo|work
    dinero|money
    rojo|red
    azul|blue
    verde|green
    grande|big
    pequeño|small
    feliz|happy
    triste|sad
    rápido|fast
    hablar|to speak
    comer|to eat
    beber|to drink
    vivir|to live
    escribir|to write
    leer|to read
    correr|to run
    dormir|to sleep
    querer|to want / to love
    poder|to be able to
    tener|to have
    hacer|to do / to make
    ir|to go
    venir|to come
    saber|to know (facts)
    conocer|to know (people, places)
    ayer|yesterday
    mañana|tomorrow / morning
    siempre|always
    nunca|never
    """

    static let french = """
    bonjour|hello
    merci|thank you
    s'il vous plaît|please
    au revoir|goodbye
    chien|dog
    chat|cat
    maison|house
    eau|water
    pain|bread
    livre|book
    école|school
    ami|friend
    voiture|car
    rouge|red
    bleu|blue
    grand|tall / big
    petit|small
    heureux|happy
    manger|to eat
    boire|to drink
    parler|to speak
    aller|to go
    avoir|to have
    être|to be
    faire|to do / to make
    """

    static let german = """
    hallo|hello
    danke|thank you
    bitte|please
    tschüss|bye
    Hund|dog
    Katze|cat
    Haus|house
    Wasser|water
    Brot|bread
    Buch|book
    Schule|school
    Freund|friend
    Auto|car
    rot|red
    blau|blue
    groß|big
    klein|small
    glücklich|happy
    essen|to eat
    trinken|to drink
    sprechen|to speak
    gehen|to go
    haben|to have
    sein|to be
    """

    static let literature = """
    1984|George Orwell
    Pride and Prejudice|Jane Austen
    To Kill a Mockingbird|Harper Lee
    The Great Gatsby|F. Scott Fitzgerald
    Moby-Dick|Herman Melville
    Hamlet|William Shakespeare
    The Odyssey|Homer
    Frankenstein|Mary Shelley
    Beloved|Toni Morrison
    One Hundred Years of Solitude|Gabriel García Márquez
    The Catcher in the Rye|J. D. Salinger
    Crime and Punishment|Fyodor Dostoevsky
    War and Peace|Leo Tolstoy
    Things Fall Apart|Chinua Achebe
    The Scarlet Letter|Nathaniel Hawthorne
    Of Mice and Men|John Steinbeck
    Brave New World|Aldous Huxley
    Jane Eyre|Charlotte Brontë
    Wuthering Heights|Emily Brontë
    The Divine Comedy|Dante Alighieri
    Don Quixote|Miguel de Cervantes
    The Adventures of Huckleberry Finn|Mark Twain
    Their Eyes Were Watching God|Zora Neale Hurston
    Fahrenheit 451|Ray Bradbury
    """

    static let art = """
    Mona Lisa|Leonardo da Vinci
    The Starry Night|Vincent van Gogh
    The Persistence of Memory|Salvador Dalí
    Guernica|Pablo Picasso
    The Scream|Edvard Munch
    Girl with a Pearl Earring|Johannes Vermeer
    The Birth of Venus|Sandro Botticelli
    The Night Watch|Rembrandt
    Water Lilies|Claude Monet
    The Sistine Chapel ceiling|Michelangelo
    American Gothic|Grant Wood
    The Kiss|Gustav Klimt
    The Great Wave off Kanagawa|Katsushika Hokusai
    Campbell's Soup Cans|Andy Warhol
    The School of Athens|Raphael
    Liberty Leading the People|Eugène Delacroix
    """

    static let mythology = """
    Zeus|the sky and thunder
    Poseidon|the sea
    Hades|the underworld
    Athena|wisdom and war strategy
    Apollo|the sun, music, and prophecy
    Artemis|the hunt and the moon
    Aphrodite|love and beauty
    Ares|war
    Hermes|messengers, travel, and thieves
    Hephaestus|fire and the forge
    Demeter|the harvest and agriculture
    Dionysus|wine and festivity
    Hera|marriage and family
    Hestia|the hearth and home
    """

    static let philosophers = """
    Socrates|questioning to expose ignorance (the Socratic method)
    Plato|the theory of Forms
    Aristotle|virtue as the mean between extremes
    René Descartes|“I think, therefore I am”
    John Locke|natural rights to life, liberty, and property
    Thomas Hobbes|life without government is “nasty, brutish, and short”
    Immanuel Kant|the categorical imperative
    John Stuart Mill|utilitarianism: the greatest good for the greatest number
    Friedrich Nietzsche|“God is dead” and the Übermensch
    Jean-Paul Sartre|“existence precedes essence”
    Confucius|filial piety and social harmony
    Karl Marx|history as class struggle
    """

    static let literaryDevices = """
    a metaphor|a direct comparison without “like” or “as”
    a simile|a comparison using “like” or “as”
    personification|giving human traits to nonhuman things
    alliteration|repetition of initial consonant sounds
    hyperbole|deliberate exaggeration
    irony|a contrast between expectation and reality
    foreshadowing|hints about what will happen later
    onomatopoeia|a word that imitates a sound
    an allusion|an indirect reference to a well-known work or event
    an oxymoron|two contradictory terms placed together
    imagery|descriptive language appealing to the senses
    a paradox|a seemingly contradictory statement that reveals a truth
    """

    static let computerScience = """
    an algorithm|a step-by-step procedure for solving a problem
    a variable|a named storage location for a value
    recursion|a function that calls itself
    an array|an ordered collection of elements accessed by index
    a hash table|a structure mapping keys to values via a hash function
    a stack|a last-in, first-out (LIFO) structure
    a queue|a first-in, first-out (FIFO) structure
    a compiler|translates source code into machine code
    an API|a defined interface for software components to communicate
    a boolean|a value that is either true or false
    encryption|encoding data so only authorized parties can read it
    a binary tree|a structure where each node has at most two children
    an operating system|software that manages hardware and runs programs
    a bug|an error in a program
    """

    static let bigO = """
    binary search on a sorted array|O(log n)
    linear search|O(n)
    merge sort|O(n log n)
    bubble sort (worst case)|O(n²)
    hash table lookup (average)|O(1)
    accessing an array element by index|O(1)
    generating all subsets of a set|O(2ⁿ)
    """

    static let psychology = """
    classical conditioning|learning by associating two stimuli (Pavlov)
    operant conditioning|learning through rewards and punishments (Skinner)
    cognitive dissonance|discomfort from holding conflicting beliefs
    confirmation bias|favoring information that confirms existing beliefs
    the placebo effect|improvement caused by belief in a treatment
    Maslow's hierarchy|a pyramid of needs from physiological to self-actualization
    the bystander effect|people are less likely to help when others are present
    neuroplasticity|the brain's ability to reorganize itself
    short-term memory|holding a small amount of information briefly
    extrinsic motivation|doing something for an outside reward
    intrinsic motivation|doing something because it is rewarding in itself
    the Dunning–Kruger effect|low-skill people overestimating their ability
    """

    static let economics = """
    supply and demand|the relationship that sets market prices
    inflation|a general rise in prices over time
    GDP|the total value of goods and services a country produces
    opportunity cost|the value of the next-best alternative given up
    a monopoly|a market with a single seller
    elasticity|how responsive quantity is to a change in price
    a recession|a significant decline in economic activity
    fiscal policy|government use of taxes and spending
    monetary policy|central bank control of money supply and interest rates
    comparative advantage|producing at a lower opportunity cost than others
    a tariff|a tax on imported goods
    scarcity|limited resources versus unlimited wants
    """

    static let finance = """
    compound interest|interest earned on both principal and past interest
    a budget|a plan for income and spending
    a credit score|a number rating how reliably you repay debt
    an index fund|a fund that tracks a market index
    diversification|spreading investments to reduce risk
    an emergency fund|savings set aside for unexpected expenses
    APR|the yearly cost of borrowing, including fees
    a Roth IRA|a retirement account funded with after-tax money
    net worth|assets minus liabilities
    a stock|a share of ownership in a company
    a bond|a loan to a government or company that pays interest
    """
}

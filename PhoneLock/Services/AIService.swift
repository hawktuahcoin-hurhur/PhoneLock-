import Foundation

/// Generates multiple-choice questions for any topic with the Claude API (raw HTTP; there is no official Swift SDK).
enum AIService {
    enum AIError: LocalizedError {
        case missingKey
        case http(Int, String)
        case refused
        case badOutput

        var errorDescription: String? {
            switch self {
            case .missingKey: return "Add your Anthropic API key in Settings → AI Topics to study AI-generated topics."
            case .http(let code, let msg): return "Claude API error \(code): \(msg)"
            case .refused: return "Claude declined to generate questions for this topic."
            case .badOutput: return "Couldn't read the generated questions. Try again."
            }
        }
    }

    static let models = ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"]

    private struct Generated: Decodable {
        struct Item: Decodable {
            let prompt: String
            let choices: [String]
            let answer_index: Int
            let explanation: String
        }
        let questions: [Item]
    }

    private static let schema: [String: Any] = [
        "type": "object",
        "properties": [
            "questions": [
                "type": "array",
                "items": [
                    "type": "object",
                    "properties": [
                        "prompt": ["type": "string"],
                        "choices": ["type": "array", "items": ["type": "string"]],
                        "answer_index": ["type": "integer"],
                        "explanation": ["type": "string"],
                    ],
                    "required": ["prompt", "choices", "answer_index", "explanation"],
                    "additionalProperties": false,
                ],
            ],
        ],
        "required": ["questions"],
        "additionalProperties": false,
    ]

    static func generate(topicID: String, topic: String, count: Int, model: String, avoiding recent: [String]) async throws -> [Question] {
        guard let key = Keychain.apiKey, !key.isEmpty else { throw AIError.missingKey }

        let avoid = recent.suffix(30).map { "- \($0)" }.joined(separator: "\n")
        let userPrompt = """
        Write \(count) multiple-choice study questions on: \(topic).

        Requirements:
        - Exactly 4 choices each, exactly one unambiguously correct; answer_index is its 0-based index.
        - Vary the position of the correct answer.
        - Mix difficulty from medium to hard, testing real understanding rather than trivia wording.
        - Keep prompts under 300 characters and choices under 100 characters. Plain text only, no markdown.
        - explanation: one or two sentences on why the answer is right.
        \(avoid.isEmpty ? "" : "\nDo not repeat these recent questions:\n\(avoid)")
        """

        var body: [String: Any] = [
            "model": model,
            "max_tokens": 16000,
            "system": "You are an expert teacher and test writer creating accurate, exam-quality practice questions for a student's daily study session.",
            "messages": [["role": "user", "content": userPrompt]],
        ]
        var outputConfig: [String: Any] = ["format": ["type": "json_schema", "schema": schema]]
        if model != "claude-haiku-4-5" { outputConfig["effort"] = "low" }
        body["output_config"] = outputConfig

        var request = URLRequest(url: URL(string: "https://api.anthropic.com/v1/messages")!)
        request.httpMethod = "POST"
        request.timeoutInterval = 180
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.setValue(key, forHTTPHeaderField: "x-api-key")
        request.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")
        if model == "claude-opus-5" {
            // Re-run a safety-declined request on Anthropic's recommended fallback model instead of failing.
            request.setValue("server-side-fallback-2026-07-01", forHTTPHeaderField: "anthropic-beta")
            body["fallbacks"] = "default"
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]

        guard status == 200 else {
            let message = (json["error"] as? [String: Any])?["message"] as? String ?? String(data: data, encoding: .utf8) ?? ""
            throw AIError.http(status, message)
        }
        if json["stop_reason"] as? String == "refusal" { throw AIError.refused }

        let blocks = json["content"] as? [[String: Any]] ?? []
        guard let text = blocks.first(where: { $0["type"] as? String == "text" })?["text"] as? String,
              let parsed = try? JSONDecoder().decode(Generated.self, from: Data(text.utf8))
        else { throw AIError.badOutput }

        let questions = parsed.questions.compactMap { item -> Question? in
            guard item.choices.count >= 2, item.choices.indices.contains(item.answer_index) else { return nil }
            return Question(id: "\(topicID)|\(UUID().uuidString)", topicID: topicID, prompt: item.prompt,
                            choices: item.choices, answerIndex: item.answer_index, explanation: item.explanation)
        }
        guard !questions.isEmpty else { throw AIError.badOutput }
        return questions
    }
}

// ==============================================================================
// GHITA CODING AGENT - Vision Screenshot Analyzer
// ==============================================================================
import fs from 'fs';
import path from 'path';
import os from 'os';
export class VisionScreenshotAnalyzer {
    configPath;
    constructor() {
        this.configPath = path.resolve(os.homedir(), '.openclaude.json');
    }
    /**
     * Load active API configuration from ~/.openclaude.json
     */
    loadConfig() {
        try {
            if (!fs.existsSync(this.configPath))
                return null;
            const raw = fs.readFileSync(this.configPath, 'utf-8');
            const config = JSON.parse(raw);
            // Determine model based on UI routing or fallbacks
            const activeModelKey = config.agentRouting?.UI || config.agentRouting?.default || 'openai-gpt-4o';
            const meta = config.agentModels[activeModelKey];
            if (meta && meta.api_key) {
                return {
                    apiKey: meta.api_key,
                    baseUrl: meta.base_url || (meta.type === 'openai' ? 'https://api.openai.com/v1' : 'https://api.anthropic.com/v1'),
                    model: meta.default_model || (meta.type === 'openai' ? 'gpt-4o' : 'claude-3-5-sonnet-latest'),
                    type: meta.type,
                };
            }
            // If the specific route is not set up, find any provider with a key
            for (const [key, provider] of Object.entries(config.agentModels)) {
                if (provider.api_key) {
                    return {
                        apiKey: provider.api_key,
                        baseUrl: provider.base_url || (provider.type === 'openai' ? 'https://api.openai.com/v1' : 'https://api.anthropic.com/v1'),
                        model: provider.default_model || key,
                        type: provider.type,
                    };
                }
            }
        }
        catch (e) {
            console.error('Failed to load local config in VisionScreenshotAnalyzer:', e);
        }
        return null;
    }
    /**
     * Analyze screenshot for general layout and element locations
     */
    async analyze(screenshotBase64) {
        const apiConfig = this.loadConfig();
        if (!apiConfig) {
            throw new Error('No API Key configured. Please configure OpenAI or Anthropic in the API Manager.');
        }
        const prompt = `Analyze this GUI screenshot. Identify all interactive elements (buttons, links, inputs, icons, dropdowns) and return them as a JSON list.
Output format must be a valid JSON array of elements inside a markdown code block:
\`\`\`json
[
  {
    "name": "login button",
    "role": "button",
    "box": { "x1": 100, "y1": 200, "x2": 150, "y2": 220 }
  }
]
\`\`\`
Note: All coordinates in "box" must be normalized from 0 to 1000 based on the screenshot dimension (0 is top-left, 1000 is bottom-right). Include text elements that can be clicked.`;
        const content = await this.queryMultimodalLLM(apiConfig, screenshotBase64, prompt);
        const elements = this.parseJsonBlock(content, []);
        return {
            elements,
            description: 'Extracted elements from screenshot',
        };
    }
    /**
     * Ground a natural language description to coordinates
     */
    async ground(screenshotBase64, description) {
        const apiConfig = this.loadConfig();
        if (!apiConfig) {
            throw new Error('No API Key configured. Please configure OpenAI or Anthropic in the API Manager.');
        }
        const prompt = `You are a GUI grounding assistant. Look at the screenshot and find the coordinate box or point of the target element described as: "${description}".
Provide your output as a single line Action call using one of the following formats:
- click(start_box='<bbox>x1 y1 x2 y2</bbox>') where coordinates are normalized from 0 to 1000
- click(start_box='<point>x y</point>') where coordinates are normalized from 0 to 1000
- click(start_box='(x1,y1,x2,y2)') where coordinates are normalized from 0 to 1000

Example: click(start_box='<bbox>120 450 160 480</bbox>')
Example: click(start_box='<point>500 230</point>')
Example: click(start_box='(250,300)')

Only output the Action. Do not write any HTML tags, explainers or other text.`;
        return await this.queryMultimodalLLM(apiConfig, screenshotBase64, prompt);
    }
    /**
     * Helper to perform HTTP request to multimodal LLMs
     */
    async queryMultimodalLLM(config, imageBase64, prompt) {
        const url = config.baseUrl.endsWith('/') ? config.baseUrl : config.baseUrl + '/';
        if (config.type === 'openai') {
            const response = await fetch(url + 'chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${config.apiKey}`,
                },
                body: JSON.stringify({
                    model: config.model,
                    messages: [
                        {
                            role: 'user',
                            content: [
                                { type: 'text', text: prompt },
                                {
                                    type: 'image_url',
                                    image_url: {
                                        url: `data:image/png;base64,${imageBase64}`,
                                    },
                                },
                            ],
                        },
                    ],
                    max_tokens: 1000,
                    temperature: 0,
                }),
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`OpenAI Vision API Error (${response.status}): ${errorText}`);
            }
            const res = await response.json();
            return res.choices?.[0]?.message?.content || '';
        }
        else if (config.type === 'anthropic') {
            const response = await fetch(url + 'messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': config.apiKey,
                    'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify({
                    model: config.model,
                    messages: [
                        {
                            role: 'user',
                            content: [
                                {
                                    type: 'image',
                                    source: {
                                        type: 'base64',
                                        media_type: 'image/png',
                                        data: imageBase64,
                                    },
                                },
                                { type: 'text', text: prompt },
                            ],
                        },
                    ],
                    max_tokens: 1000,
                    temperature: 0,
                }),
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Anthropic Vision API Error (${response.status}): ${errorText}`);
            }
            const res = await response.json();
            return res.content?.[0]?.text || '';
        }
        else {
            throw new Error(`Multimodal provider type not supported: ${config.type}`);
        }
    }
    parseJsonBlock(text, defaultValue) {
        try {
            const match = text.match(/```json\s*([\s\S]+?)\s*```/) || text.match(/```\s*([\s\S]+?)\s*```/);
            const jsonStr = (match && match[1]) ? match[1] : text;
            return JSON.parse(jsonStr.trim());
        }
        catch {
            return defaultValue;
        }
    }
}
//# sourceMappingURL=analyzer.js.map
declare module 'markdown-it' {
  export interface Token {
    type: string
    tag: string
    attrs: [string, string][] | null
    content: string
    children?: Token[]
  }

  export interface RendererEnv {
    [key: string]: unknown
  }

  type RenderRule = (
    tokens: Token[],
    idx: number,
    options: unknown,
    env: RendererEnv,
    self: { renderToken: (tokens: Token[], idx: number, options: unknown) => string }
  ) => string

  export interface RendererRules {
    [key: string]: RenderRule | undefined
  }

  export default class MarkdownIt {
    renderer: { rules: RendererRules }
    inline: { ruler: { before(a: string, b: string, fn: unknown): void } }
    use(plugin: (md: MarkdownIt) => void): this
    render(src: string, env?: RendererEnv): string
    constructor(options?: { html?: boolean; linkify?: boolean; breaks?: boolean })
  }
}

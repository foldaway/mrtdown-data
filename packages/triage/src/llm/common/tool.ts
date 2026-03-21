/**
 * A generic class for LLM tools.
 */
export abstract class Tool<TParams = any> {
  /**
   * The name of the tool.
   */
  public abstract name: string;

  /**
   * The description of the tool.
   */
  public abstract description: string;

  /**
   * The JSON schema for the tool's parameters.
   */
  public abstract get paramsSchema(): { [key: string]: unknown };

  /**
   * Parse the parameters into a typed object.
   * @param params
   * @returns
   */
  public abstract parseParams(params: unknown): TParams;

  /**
   * Run the tool with the given parameters.
   * @param param
   * @returns
   */
  public abstract runner(param: TParams): Promise<string>;
}

export type ToolRegistry = Record<string, Tool>;

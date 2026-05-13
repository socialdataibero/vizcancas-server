import { Injectable, InternalServerErrorException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import { AiChatDto } from './dto/ai-chat.dto';

const AI_GRAPH_TOOL_NAME = 'create_canvas_graph';

const canvasGraphTool: Tool = {
  name: AI_GRAPH_TOOL_NAME,
  description:
    'Return a graph plan for NEW canvas nodes and edges to create in VizCanvas. ' +
    'Use empty nodes/edges when the user only wants an explanation or the request is too ambiguous.',
  input_schema: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description:
          'Short assistant reply in the same language as the user. Be truthful: only say nodes were created when nodes is non-empty.',
      },
      focusNodeId: {
        type: 'string',
        description:
          'Optional node id the UI should focus after creation, usually the final chart or table node.',
      },
      nodes: {
        type: 'array',
        description:
          'New nodes to create, ordered roughly from upstream to downstream. Use only supported types.',
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Stable local id used only inside this plan, like source, group_1 or chart_final.',
            },
            type: {
              type: 'string',
              enum: ['from', 'sql', 'group', 'join', 'chart', 'table', 'distinct', 'javascript', 'controls'],
            },
            config: {
              type: 'object',
              additionalProperties: true,
              description:
                'Node config. Examples: ' +
                'from {tableName, filters, selectedColumns, sortColumn, sortDirection}; ' +
                'sql {query, autoRun}; ' +
                'group {groupByColumns, aggregations:[{column,function,alias}]}; ' +
                'join {joinType,leftColumn,rightColumn}; ' +
                'chart {chartType,chartCatalogId,xColumn,yColumn,x2Column,y2Column,colorColumn,sizeColumn,lengthColumn,labelColumn,facetColumn}; ' +
                'table {hiddenColumns,sortColumn,sortDirection}; ' +
                'distinct {columns}; ' +
                'controls {controls:[{type,column,label,value,min,max,options}]}; ' +
                'javascript {code}.',
            },
          },
          required: ['id', 'type'],
        },
      },
      edges: {
        type: 'array',
        description:
          'Directed connections between nodes in this plan. ' +
          'Use nodes[].id for new nodes and existing node refs from the context when you want to attach a new node to the current canvas. ' +
          'For joins, use toInputIndex 0 and 1 for left and right inputs.',
        items: {
          type: 'object',
          properties: {
            from: { type: 'string' },
            to: { type: 'string' },
            toInputIndex: { type: 'integer' },
          },
          required: ['from', 'to'],
        },
      },
    },
    required: ['summary', 'nodes', 'edges'],
  },
};

@Injectable()
export class AiService {
  private getClient(): Anthropic {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new InternalServerErrorException('ANTHROPIC_API_KEY environment variable is not set');
    return new Anthropic({ apiKey });
  }

  private buildSystemPrompt(context?: AiChatDto['context']): string {
    let system = `You are an AI data analyst assistant embedded in VizCanvas, a visual data analysis tool powered by DuckDB.

You help users explore, transform, and visualize their data. You can:
- Answer questions about the data and suggest SQL queries
- Design new workflows made of canvas nodes and edges
- Explain what charts or transformations would be useful
- Help interpret patterns and insights in the data
- Suggest which chart type best fits the data

Always use the tool "${AI_GRAPH_TOOL_NAME}".

Rules for graph planning:
- You can only create NEW nodes in the returned plan. Do not pretend to edit existing nodes.
- If the user only wants an explanation, or the request is ambiguous, return empty nodes and edges.
- Use only table names that appear in the provided context. Do not invent guessed or placeholder table names.
- If there is exactly one available table and the user does not specify another, use that exact table name.
- Reuse relevant existing nodes from the current canvas when they already provide the needed input.
- You may connect NEW nodes to EXISTING nodes by referencing an existing node ref in edges[].from or edges[].to.
- Every edge must reference either a nodes[].id from this plan or an existing node ref listed in the context below.
- Never return an edge that only connects existing nodes to other existing nodes.
- Prefer "group" for straightforward group-by + aggregation workflows.
- If you create a "group" node, its config must include at least one groupByColumns value whenever source columns are available.
- When the user asks for a chart by category/dimension and value/measure, prefer creating a complete flow with both the transformation node and the chart node.
- Prefer "sql" for custom calculations, filters, renames, CASE logic, CTEs, or complex transformations.
- Use "table" when a preview table would help.
- Use "chart" for visualization and choose one supported chartType: bar, barX, barY, line, area, scatter, dot, histogram, pie, heatmap, box, stackedBar, waffle, waterfall, treemap, grid, link, choropleth, geoPoint, spike, arc, sankey.
- When you need a specific chart variant from the catalog, also set chartCatalogId explicitly. Examples: grouped-bar, multi-series-line, bubble-chart, faceted-dodge, dot-map, spike-map, grid-cartogram.
- When creating a chart node, fill its required field mappings whenever they can be inferred from the available columns.
- For choropleth charts, set xColumn to the feature label or region key and yColumn to the numeric metric. Do not use the geometry column as xColumn.
- For spike maps, set xColumn to the feature label or region key and lengthColumn to the numeric metric. Do not require or set yColumn.
- For bubble maps, set xColumn to the feature label or region key and sizeColumn to the numeric metric when available. Do not require or set yColumn.
- For grid cartograms, set xColumn and yColumn to numeric grid coordinates and colorColumn to the numeric value.
- Use "join" only when two upstream inputs are needed.
- Use "controls" only for interactive filtering controls.
- Use "javascript" only when the user explicitly asks for JavaScript logic.
- If there is already a matching From node for the requested table, prefer connecting downstream nodes to it instead of creating another From node.
- For SQL nodes, DuckDB syntax is required and upstream aliases can be input, input1, input2, etc.
- The summary must be concise, practical, and in the user's language.
- Never say nodes were created if nodes is empty.`;

    if (context?.tables && context.tables.length > 0) {
      system += '\n\n## Available Tables\n';
      context.tables.forEach((t) => {
        system += `\n**${t.name}** (${t.columns.length} columns)\n`;
        system += t.columns.map((c) => `  - ${c.name}: ${c.type}`).join('\n');
      });
    }

    if (context?.nodeCount !== undefined) {
      system += `\n\n## Canvas State\nCurrent canvas has ${context.nodeCount} node(s).`;
    }

    if (context?.existingNodes && context.existingNodes.length > 0) {
      system += '\n\n## Existing Nodes On Current Page\n';
      context.existingNodes.slice(0, 20).forEach((node) => {
        system += `\n- ref: ${node.ref} | type: ${node.type} | status: ${node.status} | ${node.summary}`;
        if (node.columns && node.columns.length > 0) {
          system += ` | columns: ${node.columns.join(', ')}`;
        }
      });
      system += '\nUse the ref value whenever you want to connect a new node to one of these existing nodes.';
    }

    return system;
  }

  async chat(dto: AiChatDto) {
    try {
      const client = this.getClient();

      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1400,
        system: this.buildSystemPrompt(dto.context),
        messages: dto.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        tools: [canvasGraphTool],
        tool_choice: {
          type: 'tool',
          name: AI_GRAPH_TOOL_NAME,
          disable_parallel_tool_use: true,
        },
      });

      let plan: Record<string, unknown> | null = null;
      let textReply = '';

      for (const block of response.content) {
        if (block.type === 'tool_use' && block.name === AI_GRAPH_TOOL_NAME) {
          plan = block.input as Record<string, unknown>;
        }
        if (block.type === 'text' && !textReply) {
          textReply = block.text;
        }
      }

      const reply =
        (typeof plan?.summary === 'string' ? plan.summary.trim() : '') ||
        textReply ||
        'Preparé una respuesta, pero no pude resumirla correctamente.';

      return {
        reply,
        plan,
        usage: {
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
        },
      };
    } catch (err) {
      throw new InternalServerErrorException(
        err instanceof Error ? err.message : 'Unknown error',
      );
    }
  }
}

"use client";
import { useMemo } from "react";
import { sankey, sankeyLinkHorizontal } from "d3-sankey";
import { currentApplicationFlow } from "@/lib/business/application-flow";
import type { Application } from "@/lib/models";

export function CurrentApplicationFlow({
  applications,
  days,
}: {
  applications: Application[];
  days: number;
}) {
  const flow = useMemo(
    () => currentApplicationFlow(applications, days),
    [applications, days],
  );
  const graph = useMemo(() => {
    if (!flow.total) return null;
    const nodes = [
      { id: "total", label: "Total Applications" },
      ...flow.rows.map((row) => ({
        id: `status:${row.status}`,
        label: row.status,
      })),
      ...[...new Set(flow.rows.map((row) => row.outcome))].map((outcome) => ({
        id: `outcome:${outcome}`,
        label: outcome,
      })),
    ];
    const links = flow.rows.flatMap((row) => [
      { source: "total", target: `status:${row.status}`, value: row.count },
      {
        source: `status:${row.status}`,
        target: `outcome:${row.outcome}`,
        value: row.count,
      },
    ]);
    const height = Math.max(300, flow.rows.length * 52 + 64);
    return {
      ...sankey<{ id: string; label: string }, { value: number }>()
        .nodeId((node) => node.id)
        .nodeWidth(14)
        .nodePadding(28)
        .extent([
          [8, 40],
          [792, height - 20],
        ])({ nodes, links }),
      height,
    };
  }, [flow]);
  if (!graph)
    return (
      <p className="flow-explanation">
        Import or create applications to see your current status distribution.
      </p>
    );
  return (
    <>
      <p className="flow-explanation">
        {flow.total} applications · No Reply means Applied for at least {days}{" "}
        days. This display filter does not change stored statuses. Outcome
        categories summarize current status only.
      </p>
      <div
        className="flow-scroll"
        tabIndex={0}
        role="region"
        aria-label="Scrollable current status diagram"
      >
        <svg
          viewBox={`0 0 800 ${graph.height}`}
          role="img"
          aria-label={`Current status distribution for ${flow.total} applications. Counts appear in the table below.`}
        >
          {graph.links.map((link, index) => (
            <path
              key={index}
              d={sankeyLinkHorizontal()(link) || ""}
              stroke="var(--primary)"
              strokeOpacity={0.25}
              fill="none"
              strokeWidth={Math.max(1.5, link.width || 0)}
            >
              <title>{`${typeof link.source === "object" ? link.source.label : ""} → ${typeof link.target === "object" ? link.target.label : ""}: ${link.value} applications (${((link.value / flow.total) * 100).toFixed(1)}%)`}</title>
            </path>
          ))}
          {graph.nodes.map((node) => (
            <g key={node.id}>
              <rect
                x={node.x0}
                y={node.y0}
                width={14}
                height={Math.max(2, (node.y1 || 0) - (node.y0 || 0))}
                fill={`var(--stage-${node.label.toLowerCase().replaceAll(" ", "-")}, var(--primary))`}
                rx={4}
              />
              <text
                className="flow-node-label"
                x={
                  node.id.startsWith("outcome:")
                    ? (node.x0 || 0) - 8
                    : (node.x1 || 0) + 8
                }
                y={((node.y0 || 0) + (node.y1 || 0)) / 2}
                dy=".35em"
                textAnchor={node.id.startsWith("outcome:") ? "end" : "start"}
              >
                {node.label} · {node.value}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <div className="flow-table-wrap">
        <table>
          <caption>Current application status distribution</caption>
          <thead>
            <tr>
              <th scope="col">Status</th>
              <th scope="col">Applications</th>
              <th scope="col">Share</th>
              <th scope="col">Outcome category</th>
            </tr>
          </thead>
          <tbody>
            {flow.rows.map((row) => (
              <tr key={row.status}>
                <th scope="row">{row.status}</th>
                <td>{row.count}</td>
                <td>{row.percent.toFixed(1)}%</td>
                <td>{row.outcome}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

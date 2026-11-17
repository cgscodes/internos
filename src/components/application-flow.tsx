"use client";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { sankey, sankeyLinkHorizontal } from "d3-sankey";
import { useWorkspace } from "./workspace-provider";
import { applicationFlow } from "@/lib/business/application-flow";
import { CurrentApplicationFlow } from "./current-application-flow";
import { Empty } from "./shared";
const subscribe = () => () => {};
export function ApplicationFlow() {
  const ready = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const { data } = useWorkspace();
  const [view, setView] = useState("current");
  const [days, setDays] = useState(30);
  const flow = useMemo(() => applicationFlow(data.events), [data.events]);
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(640, entry.contentRect.width)),
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const graph = useMemo(() => {
    if (!flow.total) return null;
    const ids = [
      ...new Set(
        flow.rows.flatMap((row) => [`before:${row.from}`, `after:${row.to}`]),
      ),
    ];
    const height = Math.max(
      112,
      Math.max(
        new Set(flow.rows.map((row) => row.from)).size,
        new Set(flow.rows.map((row) => row.to)).size,
      ) *
        40 +
        48,
    );
    const layout = sankey<
      { id: string; status: string },
      { percent: number; outgoingPercent: number }
    >()
      .nodeId((node) => node.id)
      .nodeWidth(12)
      .nodePadding(24)
      .iterations(6)
      .extent([
        [4, 32],
        [width - 4, height - 16],
      ])({
      nodes: ids.map((id) => ({ id, status: id.split(":")[1] })),
      links: flow.rows.map((row) => ({
        source: `before:${row.from}`,
        target: `after:${row.to}`,
        value: row.count,
        percent: row.percent,
        outgoingPercent: row.outgoingPercent,
      })),
    });
    return { ...layout, height };
  }, [flow, width]);
  const percent = (value: number) => `${value.toFixed(1)}%`;
  return (
    <section
      className="panel application-flow"
      aria-labelledby="application-flow-title"
    >
      <div className="section-heading">
        <div>
          <h2 id="application-flow-title">Application Flow</h2>
          <p>
            {view === "current"
              ? "Current application distribution"
              : `Recorded status changes · ${flow.total} events`}
          </p>
        </div>
      </div>
      <div className="form-actions">
        <label>
          Analytics view
          <select
            disabled={!ready}
            value={view}
            onChange={(event) => setView(event.target.value)}
          >
            <option value="current">Current Status</option>
            <option value="transitions">Status Transitions</option>
          </select>
        </label>
        {view === "current" && (
          <label>
            No Reply after days
            <input
              type="number"
              min={1}
              max={3650}
              value={days}
              onChange={(event) =>
                setDays(
                  Math.min(3650, Math.max(1, Number(event.target.value) || 1)),
                )
              }
            />
          </label>
        )}
      </div>
      <div ref={container} className="flow-content">
        {view === "current" ? (
          <CurrentApplicationFlow
            applications={data.applications}
            days={days}
          />
        ) : (
          <>
            {graph ? (
              <>
                <p className="flow-explanation">
                  Before → after. Repeated and backward moves count each time;
                  this is a transition summary, not a conversion funnel.
                </p>
                <div className="flow-scroll">
                  <svg
                    viewBox={`0 0 ${width} ${graph.height}`}
                    role="img"
                    aria-label={`Application Flow: ${flow.total} recorded status changes. Full counts and percentages are in the table below.`}
                  >
                    <text x={4} y={16} className="flow-column-label">
                      BEFORE
                    </text>
                    <text
                      x={width - 4}
                      y={16}
                      textAnchor="end"
                      className="flow-column-label"
                    >
                      AFTER
                    </text>
                    {graph.links.map((link, index) => (
                      <path
                        key={index}
                        d={sankeyLinkHorizontal()(link) || ""}
                        fill="none"
                        stroke="var(--primary)"
                        strokeOpacity={0.22}
                        strokeWidth={Math.max(1.5, link.width || 0)}
                      >
                        <title>{`${typeof link.source === "object" ? link.source.status : ""} → ${typeof link.target === "object" ? link.target.status : ""}: ${link.value} events · ${percent(link.percent)} of all recorded changes · ${percent(link.outgoingPercent)} of this status’s outgoing changes`}</title>
                      </path>
                    ))}
                    {graph.nodes.map((node) => (
                      <g key={node.id}>
                        <rect
                          x={node.x0}
                          y={node.y0}
                          width={12}
                          height={Math.max(1, (node.y1 || 0) - (node.y0 || 0))}
                          fill={`var(--stage-${node.status.toLowerCase()})`}
                          rx={4}
                        />
                        <text
                          x={
                            node.id.startsWith("before:")
                              ? (node.x1 || 0) + 8
                              : (node.x0 || 0) - 8
                          }
                          y={((node.y0 || 0) + (node.y1 || 0)) / 2}
                          dy="0.35em"
                          textAnchor={
                            node.id.startsWith("before:") ? "start" : "end"
                          }
                          className="flow-node-label"
                        >
                          {node.status}
                        </text>
                      </g>
                    ))}
                  </svg>
                </div>
                <div className="flow-table-wrap">
                  <table>
                    <caption>Recorded application transitions</caption>
                    <thead>
                      <tr>
                        <th scope="col">Before</th>
                        <th scope="col">After</th>
                        <th scope="col">Events</th>
                        <th scope="col">Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {flow.rows.map((row) => (
                        <tr key={`${row.from}:${row.to}`}>
                          <th scope="row">{row.from}</th>
                          <td>{row.to}</td>
                          <td>{row.count}</td>
                          <td>{percent(row.percent)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <Empty
                title="Your flow starts with a status change"
                description="Move an application to another status to see its recorded transition here. Current statuses are never used to invent history."
              />
            )}
            <p className="flow-explanation">
              Percentages use recorded transition events, not unique
              applications. Creation events are excluded. Older records without
              explicit before/after statuses are not reconstructed.
              {flow.unavailable > 0
                ? ` ${flow.unavailable} legacy or non-transition events have no transition data.`
                : ""}
            </p>
          </>
        )}
      </div>
    </section>
  );
}

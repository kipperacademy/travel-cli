import { setTraceProcessors, type TracingProcessor } from '@openai/agents';
import { ROOT_CONTEXT, trace, SpanStatusCode, diag, DiagConsoleLogger, DiagLogLevel, type Span } from '@opentelemetry/api';
import { BasicTracerProvider, BatchSpanProcessor, AlwaysOnSampler } from '@opentelemetry/sdk-trace-base';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';

// Não é a integração oficial Python nem promete a aba Agents do Logfire.
export function configureTracing() {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR);
  const exporter = new OTLPTraceExporter({
    url: `${process.env.LOGFIRE_BASE_URL || 'https://logfire-us.pydantic.dev'}/v1/traces`,
    headers: { Authorization: process.env.LOGFIRE_TOKEN! },
    timeoutMillis: 10_000,
  });
  const provider = new BasicTracerProvider({
    sampler: new AlwaysOnSampler(), // Registra todas as execuções da aula.
    resource: resourceFromAttributes({ 'service.name': 'travel-cli' }),
    spanProcessors: [new BatchSpanProcessor(exporter)],
  });
  const tracer = provider.getTracer('agents-sdk-bridge');
  const spans = new Map<string, Span>();
  const processor: TracingProcessor = {
    async onTraceStart(t) {
      const root = tracer.startSpan(t.name, {}, ROOT_CONTEXT);
      root.setAttribute('agents.trace_id', t.traceId);
      spans.set(t.traceId, root);
      console.log(`Logfire trace_id: ${root.spanContext().traceId}`);
    },
    async onTraceEnd(t) { spans.get(t.traceId)?.end(); spans.delete(t.traceId); },
    async onSpanStart(s) {
      const d = s.spanData;
      const name = d.type === 'handoff' ? `handoff: ${d.from_agent}`
        : 'name' in d ? d.name : d.type;
      const parent = spans.get(s.parentId || s.traceId);
      const span = tracer.startSpan(name, {
        startTime: s.startedAt ? new Date(s.startedAt) : undefined,
        attributes: { 'agents.span_type': d.type, 'agents.span_id': s.spanId },
      }, parent ? trace.setSpan(ROOT_CONTEXT, parent) : ROOT_CONTEXT);
      spans.set(s.spanId, span);
      if (d.type === 'agent') console.log(`→ ${name}`);
    },
    async onSpanEnd(s) {
      const span = spans.get(s.spanId);
      if (s.spanData.type === 'handoff') {
        const name = `${s.spanData.from_agent} → ${s.spanData.to_agent}`;
        span?.updateName(name); console.log(`→ ${name}`);
      }
      // Entradas/saídas são intencionais para a aula. Use dados de demonstração.
      span?.setAttribute('agents.data', JSON.stringify(s.spanData));
      if (s.error) span?.setStatus({ code: SpanStatusCode.ERROR, message: s.error.message });
      span?.end(s.endedAt ? new Date(s.endedAt) : undefined);
      spans.delete(s.spanId);
    },
    async forceFlush() { await provider.forceFlush(); },
    async shutdown() { await provider.shutdown(); },
  };
  setTraceProcessors([processor]); // Substitui o exporter padrão: traces vão ao Logfire.
  return processor;
}

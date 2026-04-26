import { SIGNALS, METRICS } from './_data';
import IntelligenceView from './_components/IntelligenceView';

export default function IntelligencePage() {
  return <IntelligenceView signals={SIGNALS} metrics={METRICS} />;
}

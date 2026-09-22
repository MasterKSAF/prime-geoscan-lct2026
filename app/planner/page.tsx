import MissionWorkbench from '@/components/planner/mission-workbench';
import './planner.css';
import './mission-workbench.css';
import './mission-showcase.css';
import './mission-experience.css';
import './mission-map-details.css';
import './mission-operations.css';
import './mission-theme.css';
import './mission-workspaces.css';
import './mission-console.css';
import './mission-territory-console.css';
import './mission-analysis.css';
import './mission-home.css';
import './mission-simple-editor.css';
import './mission-simple-console.css';
import './mission-notifications.css';
import './mission-journal-review.css';
import './mission-action-colors.css';
import './mission-execution-queue.css';
import './mission-operation-journal.css';
import './mission-dispatcher.css';
export const metadata = {
  title: 'Миссии · планирование полётов',
  description:
    'Инженерный веб-планировщик групповых беспилотных авиационных работ. ЛЦТ 2026, задача №5.',
  icons: { icon: '/planner-icon.svg' },
};
export default function PlannerPage() {
  return <MissionWorkbench />;
}

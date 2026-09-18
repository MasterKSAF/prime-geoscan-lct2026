import MissionWorkbench from '@/components/planner/mission-workbench';
import './planner.css';
import './mission-workbench.css';
import './mission-showcase.css';
export const metadata = {
  title: 'Прайм · Планирование авиационных работ',
  description:
    'Инженерный веб-планировщик групповых беспилотных авиационных работ. ЛЦТ 2026, задача №5.',
  icons: { icon: '/planner-icon.svg' },
};
export default function PlannerPage() {
  return <MissionWorkbench />;
}

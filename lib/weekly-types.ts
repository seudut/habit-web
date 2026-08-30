export interface WeeklyTask {
  id: string;
  weekStart: string;
  date: string;
  title: string;
  actualTime: string;
  completed: 0 | 1;
  createdAt: string;
}

export interface WeeklyDiary {
  weekStart: string;
  date: string;
  content: string;
  updatedAt: string;
}

export interface WeeklyDay {
  date: string;
  label: string;
  isToday: boolean;
}

export interface WeeklyData {
  weekStart: string;
  days: WeeklyDay[];
  tasks: WeeklyTask[];
  diaries: WeeklyDiary[];
  totalTasks: number;
  completedTasks: number;
  completionRate: number;
}

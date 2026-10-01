export interface ProjectTask {
  id: string;
  projectId: string;
  parentId: string | null;
  name: string;
  startDate: string;
  endDate: string;
  progress: number;
  color: string;
  sortOrder: number;
  createdAt: string;
  children: ProjectTask[];
}

export interface Project {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  color: string;
  sortOrder: number;
  createdAt: string;
  tasks: ProjectTask[];
}

export interface ProjectsData {
  projects: Project[];
  rangeStart: string;
  rangeEnd: string;
  totalDays: number;
}

export interface ProjectInput {
  name: string;
  startDate: string;
  endDate: string;
  color: string;
}

export interface ProjectTaskInput {
  projectId: string;
  parentId?: string | null;
  name: string;
  startDate: string;
  endDate: string;
  progress: number;
  color: string;
}

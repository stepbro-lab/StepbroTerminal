import { GitBranch, GitCommitHorizontal, GitFork } from 'lucide-react'
import { useGitBranch } from '@/lib/gitBranch'
import { t } from '@/lib/i18n'

/**
 * The branch a project has checked out, small and quiet beside its name: a worktree gets its own
 * mark, and a detached checkout shows its commit. Nothing at all outside a repository.
 */
export function BranchLabel({ path, className = '' }: { path: string | null | undefined; className?: string }) {
  const branch = useGitBranch(path)
  if (!branch) return null
  const Icon = branch.detached ? GitCommitHorizontal : branch.worktree ? GitFork : GitBranch
  const tip = branch.detached ? t('Detached at {commit}', { commit: branch.name }) : branch.worktree ? t('Worktree on {branch}', { branch: branch.name }) : t('On branch {branch}', { branch: branch.name })
  return (
    <span className={`branch-label ${className}`} title={tip}>
      <Icon size={11} strokeWidth={2} className="shrink-0" />
      <span className="min-w-0 truncate">{branch.name}</span>
    </span>
  )
}

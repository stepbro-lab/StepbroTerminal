import { useState } from 'react'
import { FolderPlus } from 'lucide-react'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { addDroppedFolders, addProject } from '@/lib/actions'
import { useFolderDrop } from '@/lib/folderDrop'
import { useBinding } from '@/lib/shortcuts'
import { Keys } from '../Keys'
import { LogoMark } from '../LogoMark'
import { TopitoCanvas } from '../topito/TopitoCanvas'
import { useTopitoElsewhere } from '../topito/Topito'
import { NewSessionCluster } from './NewSessionCluster'
import { t } from '@/lib/i18n'

/** No session to dig in, so Topito looks around for one; the sidebar's ducks into his hole meanwhile. */
function SearchingTopito() {
  useTopitoElsewhere()
  return <TopitoCanvas clip="lost" cell={5} rows={15} />
}

export function EmptyState() {
  const [browsing, setBrowsing] = useState(false)
  const shellKey = useBinding('new-shell')
  const paletteKey = useBinding('palette')
  const projects = useData((s) => s.projects)
  const activeProject = useUi((s) => s.activeProject)
  const project = projects.find((p) => p.path.toLowerCase() === activeProject?.toLowerCase()) ?? projects[0]
  // A folder dragged in from the desktop lands here the same way "Add folder" would.
  const drop = useFolderDrop(addDroppedFolders)
  const hint = drop.over && (
    <div className="drop-hint">
      <FolderPlus size={16} />
      <span>{t('Drop to add folder')}</span>
    </div>
  )

  if (!project) {
    return (
      <div {...drop.props} className="relative flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <LogoMark size={72} />
        <div className="text-[14px] text-secondary">{t('Pick a folder, or drag one in, and stepbro terminal opens a shell in it.')}</div>
        <button className="btn btn-primary" onClick={() => void addProject()}>{t('Choose folder')}</button>
        {hint}
      </div>
    )
  }

  return (
    <div {...drop.props} className="relative flex h-full flex-col items-center justify-center gap-5 p-8 text-center">
      {/* The agents bloom into this space, so Topito and the folder's name step aside while they are out. */}
      <div className="transition-opacity duration-200" style={{ opacity: browsing ? 0 : 1 }}>
        {/* He shows here even while turned off: this is not where he gets in the way. */}
        <SearchingTopito />
      </div>
      <div className="transition-opacity duration-200" style={{ opacity: browsing ? 0 : 1 }}>
        {/* The name alone: the full path is long and says little at a glance, so it waits in the tooltip. */}
        <div className="text-[15px] font-semibold tracking-[-0.01em]" title={project.path}>
          {project.name}
        </div>
      </div>
      <NewSessionCluster projectPath={project.path} onOpen={setBrowsing} />
      <div className="mt-1 flex items-center gap-4 text-[12.5px] text-muted">
        {shellKey && (
          <span>
            <Keys chord={shellKey} /> shell
          </span>
        )}
        {paletteKey && (
          <span>
            <Keys chord={paletteKey} /> palette
          </span>
        )}
      </div>
      <div className="absolute bottom-4 text-[11.5px] text-faint">v{window.step.version}</div>
      {hint}
    </div>
  )
}

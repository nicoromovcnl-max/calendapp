import { AppProvider, useApp } from './store.jsx'
import Sidebar, { MobileBar } from './components/Sidebar.jsx'
import PubViews from './components/PubViews.jsx'
import PublicationDetail from './components/PublicationDetail.jsx'
import Editor from './components/Editor.jsx'
import Requests from './components/Requests.jsx'
import { AuthModal, RequestDelete, RequestEdit, RequestForm } from './components/Modals.jsx'
import Projects from './components/Projects.jsx'
import Library from './components/Library.jsx'
import Stats from './components/Stats.jsx'
import Settings from './components/Settings.jsx'
import { Icon } from './components/ui.jsx'

function Toasts() {
  const { toasts } = useApp()
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => <div key={t.id} className={`toast ${t.type}`}><i><Icon name={t.type === 'error' ? 'info' : 'check'} size={16} /></i>{t.message}</div>)}
    </div>
  )
}

function Screen() {
  const app = useApp()
  if (app.selectedPub) return <PublicationDetail key={app.selectedPub.id} />
  switch (app.view) {
    case 'requests': return <Requests />
    case 'projects': return <Projects />
    case 'library': return <Library />
    case 'stats': return <Stats />
    case 'settings': return <Settings />
    default: return <PubViews />
  }
}

function Shell() {
  const app = useApp()
  return (
    <div className="app">
      <Sidebar />
      <main className="main"><div className="workspace"><Screen /></div></main>
      <MobileBar />
      {app.editing && <Editor key={app.editing === 'new' ? 'new' : app.editing.id} />}
      {app.requestForm && <RequestForm />}
      {app.requestEdit && <RequestEdit key={app.requestEdit.id} />}
      {app.requestDelete && <RequestDelete />}
      {app.showAuth && <AuthModal />}
      <Toasts />
    </div>
  )
}

export default function App() {
  return <AppProvider><Shell /></AppProvider>
}

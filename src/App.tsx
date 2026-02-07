import { useState } from 'react'
import './App.css'
import Calculator from './components/Calculator'
import Equation from './components/Equation'
import Graph from './components/Graph'

type Tab = 'calculator' | 'equation' | 'graph'

const tabs: { key: Tab; label: string; icon: string }[] = [
  { key: 'calculator', label: '계산기', icon: '🔢' },
  { key: 'equation', label: '방정식', icon: '📐' },
  { key: 'graph', label: '그래프', icon: '📈' },
]

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('calculator')

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">Melpher</h1>
        <p className="app-subtitle">Math Helper</p>
      </header>

      <nav className="tab-bar">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`tab-btn ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </nav>

      <main className="content">
        {activeTab === 'calculator' && <Calculator />}
        {activeTab === 'equation' && <Equation />}
        {activeTab === 'graph' && <Graph />}
      </main>
    </div>
  )
}

export default App

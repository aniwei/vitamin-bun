import React from 'react'
import { Routes, Route } from 'react-router-dom'
import { Home } from './pages/Home'
import { examples } from './routes'

export default function App() {
  return (
    <div className="app-shell">
      <header className="app-nav">
        <div className="app-title">Vitamin Bun Examples</div>
        <div className="app-subtitle"></div>
      </header>
      <Routes>
        <Route path="/" element={<Home />} />
        {examples.map((example) => (
          <Route key={example.path} path={example.path} element={<example.Component />} />
        ))}
      </Routes>
    </div>
  )
}

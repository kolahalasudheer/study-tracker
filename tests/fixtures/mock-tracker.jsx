import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import MockTests from '../../src/MockTests';
import '../../src/global.css';

function Fixture() {
  const [user, setUser] = useState({ id: 'alice' });
  return <div className="app-shell"><p style={{ color: '#fff', fontSize: 12 }}>Acceptance fixture · synthetic data</p><header className="page-header"><h1 className="page-title">Mock Tracker</h1></header><MockTests user={user} /><button onClick={() => setUser(null)}>Sign out fixture</button><button onClick={() => setUser({ id: 'bob' })}>Switch fixture account</button><nav className="bottom-nav">{['Timer', 'Buddies', 'Chat', 'Progress', 'Mocks'].map(name => <button className={`nav-item${name === 'Mocks' ? ' active' : ''}`} key={name}>{name}</button>)}</nav></div>;
}
createRoot(document.getElementById('root')).render(<Fixture />);

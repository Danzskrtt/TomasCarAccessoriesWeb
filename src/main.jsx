import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '../styles.css';

class AppErrorBoundary extends React.Component {
	state = { error: null };

	static getDerivedStateFromError(error) {
		return { error };
	}

	render() {
		if (this.state.error) {
			return <main style={{ padding: '32px', fontFamily: 'sans-serif' }}><h1>Unable to load the app</h1><p>{this.state.error.message}</p></main>;
		}
		return this.props.children;
	}
}

createRoot(document.getElementById('root')).render(<AppErrorBoundary><App /></AppErrorBoundary>);

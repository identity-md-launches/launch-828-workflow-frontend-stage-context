import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import App from './App';
import { loadConfig, type Runtime } from './config';
import './styles.css';

function Bootstrap() {
  const [runtime, setRuntime] = useState<Runtime>();
  const [error, setError] = useState('');
  useEffect(() => { loadConfig().then(setRuntime).catch(e => setError(e.message)); }, []);
  if (!runtime) return <main className="bootstrap"><span className="wordmark">pachu.</span><h1>{error ? 'Unable to load the deployment' : 'Opening Pachu…'}</h1><p role={error ? 'alert' : 'status'}>{error || 'Loading the attested configuration and contract ABI.'}</p>{error && <button className="button" onClick={() => location.reload()}>Reload site</button>}</main>;
  return <App runtime={runtime} />;
}
createRoot(document.getElementById('root')!).render(<Bootstrap />);

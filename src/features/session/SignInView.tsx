import { ArrowRight, GitBranch, House, Layers, ShieldCheck, Users } from 'lucide-react';
import { ThemeToggle } from '../../components/ThemeToggle';
interface Props {
  code: string;
  setCode: (value: string) => void;
  busy: boolean;
  error: string;
  onSignIn: () => void;
}
export function SignInView({ code, setCode, busy, error, onSignIn }: Props) {
  return (
    <div className="login">
      <section className="login-story">
        <div className="brand">
          <span className="brand-mark">
            <Layers size={25} />
          </span>
          THE UNDERWRITING ROOM
        </div>
        <div>
          <span className="eyebrow">A FICTIONAL CASE. A REAL INVESTIGATION.</span>
          <h1>
            Good questions.
            <br />
            Clearer decisions.
          </h1>
          <p>Bring evidence, specialist perspectives, and your own judgment to the same table.</p>
          <div className="login-diagram">
            <span>
              <House />
              One property
            </span>
            <i />
            <span>
              <Users />
              Six specialists
            </span>
            <i />
            <span>
              <GitBranch />
              New possibilities
            </span>
          </div>
        </div>
        <small>INDEPENDENT PROTOTYPE · SYNTHETIC MATERIAL ONLY</small>
      </section>
      <section className="login-form">
        <ThemeToggle />
        <span className="eyebrow">YOUR LOCAL WORKSPACE</span>
        <h2>Take your seat.</h2>
        <p>
          Enter the access code shown in your server terminal. Each browser session has its own case
          workspace.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSignIn();
          }}
        >
          <label htmlFor="code">Local access code</label>
          <input
            id="code"
            autoFocus
            autoComplete="off"
            type="password"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Enter access code"
            required
          />
          <button className="primary" disabled={busy}>
            Enter the room <ArrowRight size={17} />
          </button>
        </form>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="login-disclaimer">
          <ShieldCheck size={22} />
          <p>
            Supports human investigation. Does not issue insurance, authenticate identities, or
            implement FCT’s internal rules.
          </p>
        </div>
      </section>
    </div>
  );
}

import '@xyflow/react/dist/style.css';
import {
  AlertTriangle,
  ArrowUpRight,
  ChevronRight,
  ExternalLink,
  FileText,
  GitBranch,
  House,
  Layers,
  LogOut,
  MessageSquare,
  Pause,
  Play,
  Plus,
  Send,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  roleNames,
  roles,
  type CaseRecord,
  type Citation,
  type EvidenceDocument,
  type Finding,
  type Review,
  type Role,
} from '../shared/types';
import { api } from './api';
import type {
  CaseCommand,
  SessionResult,
  Branch as BranchResponse,
  UploadResult,
} from './generated/api-contracts';
import { Modal } from './components/Modal';
import { ThemeToggle } from './components/ThemeToggle';
import { CaseDialog, CasesPage } from './features/cases/CaseControls';
import { BranchComparison } from './features/comparison/BranchComparison';
import { ChallengeInput } from './features/discussion/ChallengeInput';
import { TeamDiscussion } from './features/discussion/TeamDiscussion';
import { CaseDetailsPanel } from './features/documents/CaseDetailsPanel';
import { DocumentsView } from './features/documents/DocumentsView';
import { PdfViewer } from './features/documents/PdfViewer';
import { FindingAssessment } from './features/findings/FindingAssessment';
import { NotesView } from './features/notes/NotesView';
import { ReviewProgress } from './features/reviews/ReviewProgress';
import { SignInView } from './features/session/SignInView';
import { InvestigationView } from './features/workspace/InvestigationView';
import { useCommand } from './hooks/useCommand';
import { useReviewEvents } from './hooks/useReviewEvents';
import { useSession } from './hooks/useSession';
import { useWorkspace } from './hooks/useWorkspace';
const roleInitials: Record<Role, string> = {
  ownership: 'OA',
  mortgage: 'MO',
  property: 'PR',
  identity: 'ID',
  survey: 'SU',
  fraud: 'FI',
  lead: 'LR',
};
const money = (n: number) =>
  new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 0,
  }).format(n);
export function App() {
  const [page, setPage] = useState<'cases' | 'workspace'>('cases');
  const [caseDialog, setCaseDialog] = useState<CaseRecord | 'new' | null>(null);
  const [casesFilter, setCasesFilter] = useState<'all' | 'open' | 'finalized'>('open');
  const [casesSearch, setCasesSearch] = useState('');
  const [casesRevision, setCasesRevision] = useState(0);
  const caseBranches = useRef<Record<string, string>>({});
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [voiceActive, setVoiceActive] = useState(false);
  const findingDetailRef = useRef<HTMLElement>(null);
  const [findingNavigation, setFindingNavigation] = useState(0);
  const openFinding = (finding: Finding) => {
    setSelected(finding);
    setFindingNavigation((n) => n + 1);
  };
  useEffect(() => {
    if (!findingNavigation) return;
    const frame = requestAnimationFrame(() => {
      const detail = findingDetailRef.current;
      if (!detail) return;
      detail.focus({ preventScroll: true });
      detail.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'instant'
          : 'smooth',
        block: 'start',
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [findingNavigation]);

  const { signedIn, setSignedIn, branchId, setBranchId } = useSession();
  const [code, setCode] = useState('');
  const { workspace, setWorkspace, refresh } = useWorkspace(branchId);
  const { busy, error, setError, act: runCommand } = useCommand();
  const { cursor, live } = useReviewEvents(signedIn, branchId, refresh);
  const [tab, setTab] = useState('Investigation'),
    [selected, setSelected] = useState<Finding | null>(null),
    [evidence, setEvidence] = useState<{ document: EvidenceDocument; citation?: Citation } | null>(
      null,
    );
  const [modal, setModal] = useState<'branch' | 'challenge' | 'upload' | null>(null),
    [branchName, setBranchName] = useState('Scenario 02'),
    [date, setDate] = useState('2026-10-15'),
    [assumption, setAssumption] = useState(''),
    [question, setQuestion] = useState(''),
    [attach, setAttach] = useState(false),
    [note, setNote] = useState(''),
    [reviewId, setReviewId] = useState('');
  const [upload, setUpload] = useState<File | null>(null),
    [replaceId, setReplaceId] = useState('');
  const isClosed = workspace?.case.status === 'finalized';
  const detailsPending = !!workspace?.branch.details && !workspace.branch.details.confirmed;
  useEffect(() => {
    if (!branchId) return;
    try {
      sessionStorage.setItem('underwriting-branch', branchId);
    } catch {}
    setSelected(null);
    setEvidence(null);
    setReviewId('');
    void refresh(branchId).catch((e) => setError(e.message));
  }, [branchId, refresh]);
  const review = workspace?.reviews.find((r) => r.id === reviewId) || workspace?.reviews.at(-1);
  const current = !!review && review.revision === workspace?.branch.revision;
  useEffect(() => {
    setSelected((previous) =>
      previous ? review?.findings.find((f) => f.id === previous.id) || null : null,
    );
  }, [review]);
  const isRunning = review?.status === 'running';
  const latest = workspace?.reviews.at(-1);
  const createCaseCommand = (): CaseCommand => ({
    caseId: workspace!.case.id,
    branchId: workspace!.branch.id,
    expectedRevision: workspace!.branch.revision,
    commandId: crypto.randomUUID(),
  });
  const openCitation = (c: Citation) => {
    const d =
      review?.snapshot.documents.find((d) => d.id === c.documentId) ||
      workspace?.snapshot.documents.find((d) => d.id === c.documentId);
    if (d) setEvidence({ document: d, citation: c });
  };
  const cites = (citations: Citation[]) => (
    <div className="citations">
      {citations.map((c, i) => (
        <button
          key={`${c.documentId}-${i}`}
          className={c.verified === false ? 'invalid' : ''}
          onClick={() => openCitation(c)}
        >
          <FileText size={12} />
          {c.documentId} <span>p.{c.page}</span>
          <ArrowUpRight size={12} />
        </button>
      ))}
    </div>
  );
  const start = (role?: Role) =>
    runCommand(async () => {
      const r = await api<Review>('/reviews', {
        ...createCaseCommand(),
        mode: role && role !== 'lead' ? 'specialist' : 'cross',
        ...(role === 'lead'
          ? { rebuildBriefFrom: review!.id }
          : role
            ? { selectedReviewer: role }
            : {}),
      });
      setReviewId(r.id);
      await refresh();
    });
  const control = (action: string) =>
    runCommand(async () => {
      await api(`/reviews/${review!.id}/${action}`, createCaseCommand());
      await refresh();
    });
  const pendingComparisonFinding = useRef<{
    branchId: string;
    reviewId: string;
    finding: Finding;
  } | null>(null);
  useEffect(() => {
    const target = pendingComparisonFinding.current;
    if (!target || workspace?.branch.id !== target.branchId) return;
    if (reviewId !== target.reviewId) {
      setReviewId(target.reviewId);
      return;
    }
    pendingComparisonFinding.current = null;
    setTab('Investigation');
    openFinding(target.finding);
  }, [workspace?.branch.id, reviewId]);
  if (!signedIn)
    return (
      <SignInView
        code={code}
        setCode={setCode}
        busy={busy}
        error={error}
        onSignIn={() =>
          void runCommand(async () => {
            const data = await api<SessionResult>('/sessions', { accessCode: code });
            cursor.current = 0;
            setSignedIn(true);
            setBranchId(data.branchId);
          })
        }
      />
    );
  if (!workspace || workspace.branch.id !== branchId)
    return <div className="loading">Opening the case…{error && <p role="alert">{error}</p>}</div>;
  return (
    <div className={`app-shell ${page === 'cases' ? 'cases-directory' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Layers size={22} />
          </span>
          <span>
            THE
            <br />
            UNDERWRITING
            <br />
            ROOM
          </span>
        </div>
        <button
          className={`nav-item all-cases-link ${page === 'cases' ? 'active' : ''}`}
          onClick={() => setPage('cases')}
        >
          <Layers size={18} />
          All cases
        </button>
        <div className="sidebar-label">WORKSPACE</div>
        <button
          className={`nav-item ${page === 'workspace' ? 'active' : ''}`}
          onClick={() => {
            setPage('workspace');
            setTab('Investigation');
          }}
        >
          <House size={18} />{' '}
          <span className="sidebar-case-name" title={workspace.case.name}>
            {workspace.case.name}
          </span>{' '}
          <span className="sidebar-case-status">{isClosed ? 'Finalized' : 'Open'}</span>{' '}
          <ChevronRight size={14} />
        </button>
        <button
          className="nav-item"
          onClick={() => {
            setPage('workspace');
            setTab('Documents');
          }}
        >
          <FileText size={18} /> Evidence library{' '}
          <span className="count">{workspace.snapshot.documents.length}</span>
        </button>
        <button
          className="nav-item"
          onClick={() => {
            setPage('workspace');
            setTab('Team discussion');
          }}
        >
          <Users size={18} /> Review team
        </button>
        <div className="sidebar-label branch-label">
          DEAL SCENARIOS
          <button aria-label="Add branch" disabled={isClosed} onClick={() => setModal('branch')}>
            <Plus size={15} />
          </button>
        </div>
        <div className="branch-list">
          {workspace.branches.map((b) => (
            <button
              className={b.id === branchId ? 'chosen' : ''}
              key={b.id}
              onClick={() => {
                setPage('workspace');
                setBranchId(b.id);
              }}
            >
              <GitBranch size={15} />
              <span>{b.name}</span>
              {b.id === branchId && <span className="branch-dot" />}
            </button>
          ))}
        </div>
        <button className="new-branch" disabled={isClosed} onClick={() => setModal('branch')}>
          <Plus size={15} /> Branch the Deal
        </button>
        <div className="sidebar-bottom">
          <div className="demo-label">
            <span /> DEMONSTRATION RULES
          </div>
          <p>
            Fictional evidence.
            <br />
            Human judgment stays in charge.
          </p>
          <button
            onClick={() =>
              void runCommand(async () => {
                await api('/sessions', undefined, 'DELETE');
                setSignedIn(false);
                setPage('cases');
                setCasesSearch('');
                setCasesFilter('open');
                caseBranches.current = {};
                setWorkspace(null);
                setBranchId('');
                cursor.current = 0;
              })
            }
          >
            <LogOut size={15} /> Delete session & leave
          </button>
          <a href="/api/docs" target="_blank" rel="noreferrer">
            Shared API <ExternalLink size={12} />
          </a>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button className="breadcrumb-cases" onClick={() => setPage('cases')}>
              Cases
            </button>
            {page === 'workspace' && (
              <>
                <ChevronRight size={13} /> Case workspace
              </>
            )}{' '}
            <ChevronRight size={13} />
            <strong>
              {page === 'cases'
                ? 'ALL INVESTIGATIONS'
                : workspace.case.status === 'finalized'
                  ? 'FINALIZED'
                  : 'OPEN'}
            </strong>
          </div>
          <div className="topbar-right">
            <ThemeToggle />
            <span className={`connection ${live === 'Live' ? 'connected' : ''}`}>
              <i />
              {live}
            </span>
            <span className="synthetic-pill">SYNTHETIC CASE</span>
            <span className="user-avatar">YOU</span>
          </div>
        </header>
        <main>
          <CasesPage
            filter={casesFilter}
            setFilter={setCasesFilter}
            search={casesSearch}
            setSearch={setCasesSearch}
            visible={page === 'cases'}
            refreshKey={casesRevision}
            onAction={setCaseDialog}
            onOpen={(c) => {
              caseBranches.current[workspace.case.id] = branchId;
              const id = caseBranches.current[c.id] || c.branchIds[0];
              if (id !== branchId) {
                setWorkspace(null);
                setBranchId(id);
                setTab('Documents');
                setUpload(null);
                setUploadFiles([]);
                setReplaceId('');
                setNote('');
                setError('');
              }
              setPage('workspace');
            }}
          />
          <div hidden={page !== 'workspace'}>
            {isClosed && (
              <div className="notice">
                Finalized investigation · Read-only.{' '}
                {workspace.case.finalizedAt &&
                  new Date(workspace.case.finalizedAt).toLocaleDateString('en-CA')}{' '}
                · {workspace.case.finalizationNote} Reopen the case to make changes.
              </div>
            )}
            <div className="case-header">
              <div>
                <div className="eyebrow">
                  RESIDENTIAL PURCHASE <span> / </span> ONTARIO
                </div>
                <h1>{workspace.case.name}</h1>
                <p>
                  <House size={14} />{' '}
                  {workspace.snapshot.address || 'Upload documents to identify the property'}
                  <span className="separator">·</span>
                  <GitBranch size={14} />
                  {workspace.branch.name}
                </p>
              </div>
              <div className="header-actions">
                <button onClick={() => setCaseDialog(workspace.case)}>
                  {isClosed ? 'Reopen case' : 'Finalize case'}
                </button>
                <button
                  className="secondary"
                  disabled={isClosed}
                  onClick={() => setModal('branch')}
                >
                  <GitBranch size={16} /> Branch the Deal
                </button>
                <button
                  className="primary"
                  disabled={
                    isClosed ||
                    detailsPending ||
                    !workspace.snapshot.documents.length ||
                    busy ||
                    latest?.status === 'running' ||
                    latest?.status === 'paused'
                  }
                  onClick={() => start()}
                >
                  <Play size={15} />
                  {review ? 'Run full review' : 'Start team review'}
                </button>
              </div>
            </div>
            {detailsPending && (
              <div className="notice">
                Upload documents, then confirm the extracted details below before starting a review.
              </div>
            )}
            <div className="facts">
              <div>
                <span>PURCHASE PRICE</span>
                <strong>
                  {workspace.branch.details && !workspace.branch.details.values.purchasePrice
                    ? 'Not confirmed'
                    : money(workspace.branch.purchasePrice)}
                </strong>
              </div>
              <div>
                <span>NEW MORTGAGE</span>
                <strong>
                  {workspace.branch.details && !workspace.branch.details.values.loanAmount
                    ? 'Not confirmed'
                    : money(workspace.branch.loanAmount)}
                </strong>
              </div>
              <div>
                <span>PROPOSED CLOSING</span>
                <strong>
                  {!workspace.branch.closingDate || detailsPending
                    ? 'Not confirmed'
                    : new Date(workspace.branch.closingDate + 'T12:00:00').toLocaleDateString(
                        'en-CA',
                        {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        },
                      )}
                </strong>
              </div>
              <div>
                <span>CASE REVISION</span>
                <strong>
                  {String(workspace.branch.revision).padStart(2, '0')}
                  <small>{current ? 'Assessment matches' : 'Review required'}</small>
                </strong>
              </div>
            </div>
            {error && (
              <div role="alert" className="error-banner">
                <AlertTriangle size={17} />
                {error}
                <button onClick={() => setError('')} aria-label="Dismiss error">
                  <X size={16} />
                </button>
              </div>
            )}
            {review && !current && (
              <div className="notice">
                <AlertTriangle size={16} />
                Evidence has changed. This assessment belongs to revision {review.revision}; run a
                full review for revision {workspace.branch.revision}.
              </div>
            )}
            {workspace.branch.assumptions.length > 0 && (
              <div className="notice">
                <GitBranch size={16} />
                <div>
                  <strong>Hypothetical assumptions</strong>
                  <br />
                  {workspace.branch.assumptions.join(' · ')}
                </div>
              </div>
            )}
            <section className="review-strip" aria-label="Review team">
              <div className="team-caption">
                <span className="eyebrow">AT THE TABLE</span>
                <strong>{review?.stageName || 'Your team is ready'}</strong>
                <span>
                  {review
                    ? `${review.status}${review.pauseRequested && isRunning ? ' · pause requested' : ''}`
                    : 'Six specialists. One shared case.'}
                </span>
              </div>
              <div className="reviewers">
                {[...roles, 'lead' as Role].map((r) => (
                  <div
                    className={`reviewer ${review?.activities?.some((a) => a.reviewer === r && a.state === 'running') && !['failed', 'cancelled', 'interrupted'].includes(review.status) ? 'working' : ''}`}
                    key={r}
                  >
                    <span className={`role-avatar ${r}`}>{roleInitials[r]}</span>
                    <div>
                      <strong>{roleNames[r]}</strong>
                      <small>
                        {review?.activities?.some(
                          (a) => a.reviewer === r && a.state === 'running',
                        ) && !['failed', 'cancelled', 'interrupted'].includes(review.status)
                          ? 'Reviewing evidence…'
                          : review?.exchanges.some((e) => e.reviewer === r)
                            ? 'Message available'
                            : 'Awaiting review'}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
              <div className="review-controls">
                {isRunning && (
                  <button
                    className="icon-button"
                    onClick={() => control('pause')}
                    title="Pause at next stage boundary"
                    aria-label="Pause review"
                  >
                    <Pause size={17} />
                  </button>
                )}
                {review?.status === 'paused' && (
                  <button className="secondary" onClick={() => control('resume')}>
                    <Play size={15} />
                    Resume
                  </button>
                )}
                {review && ['running', 'paused'].includes(review.status) && (
                  <button
                    className="icon-button"
                    onClick={() => control('cancel')}
                    aria-label="Cancel review"
                  >
                    <X size={17} />
                  </button>
                )}
              </div>
            </section>
            {review?.mode === 'specialist' && (
              <div className="notice">
                Partial scope: {roleNames[review.selectedReviewer!]} only. Other specialist areas
                not assessed.
              </div>
            )}
            <CaseDetailsPanel workspace={workspace} refresh={refresh} openCitation={openCitation} />
            <ReviewProgress
              review={review}
              interventions={workspace.interventions}
              onRun={start}
              runDisabled={
                detailsPending ||
                !workspace.snapshot.documents.length ||
                isClosed ||
                busy ||
                latest?.status === 'running' ||
                latest?.status === 'paused' ||
                workspace.interventions.some((i) => ['queued', 'processing'].includes(i.state))
              }
              leadDisabled={
                !review ||
                review.status !== 'completed' ||
                review.needsRerun ||
                review.revision !== workspace.branch.revision
              }
            />
            {review?.error && <div className="error-banner">Incomplete review: {review.error}</div>}
            {review?.needsRerun && (
              <div className="notice">
                A response identified consequences outside its specialist’s scope. A full team rerun
                is required.
              </div>
            )}
            <nav className="tabs" aria-label="Workspace views">
              {[
                'Investigation',
                'Documents',
                'Team discussion',
                'Compare branches',
                'Brief & notes',
              ].map((t) => (
                <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
                  {t}
                  {t === 'Documents' && <span>{workspace.snapshot.documents.length}</span>}
                  {t === 'Team discussion' && !!review?.exchanges.length && (
                    <span>{review.exchanges.length}</span>
                  )}
                </button>
              ))}
              <div className="history-select">
                <label htmlFor="history">Review history</label>
                <select
                  id="history"
                  value={review?.id || ''}
                  onChange={(e) => setReviewId(e.target.value)}
                >
                  <option value="">Latest</option>
                  {workspace.reviews.map((r, i) => (
                    <option value={r.id} key={r.id}>
                      #{i + 1} · r{r.revision} ·{' '}
                      {r.mode === 'specialist' ? roleNames[r.selectedReviewer!] : 'Full scope'} ·{' '}
                      {r.status}
                    </option>
                  ))}
                </select>
              </div>
            </nav>
            <div className={`workspace-content ${evidence ? 'with-evidence' : ''}`}>
              <div className="workspace-primary">
                {tab === 'Investigation' && (
                  <InvestigationView
                    workspace={workspace}
                    review={review}
                    selected={selected}
                    isRunning={isRunning}
                    isClosed={isClosed}
                    detailsPending={detailsPending}
                    onFinding={openFinding}
                    onDocument={(document) => setEvidence({ document })}
                    onStart={() => start()}
                    cites={cites}
                  />
                )}
                {tab === 'Documents' && (
                  <DocumentsView
                    workspace={workspace}
                    isClosed={isClosed}
                    busy={busy}
                    onUpload={() => setModal('upload')}
                    onDocument={(document) => setEvidence({ document })}
                    onReveal={(id) =>
                      void runCommand(async () => {
                        await api('/documents/reveal', { ...createCaseCommand(), documentId: id });
                        await refresh();
                      })
                    }
                  />
                )}
                {tab === 'Team discussion' && (
                  <section>
                    <div className="section-heading">
                      <div>
                        <h2>At the same table</h2>
                        <p>
                          Follow who consulted whom, read their evidence, and see whether the
                          finding changed.
                        </p>
                      </div>
                      <span className="pill">One cross-review round</span>
                    </div>
                    {!review?.exchanges.length && (
                      <div className="empty-state">
                        <MessageSquare size={28} />
                        <h3>No reviewer messages yet</h3>
                        <p>Messages will appear as each review stage completes.</p>
                      </div>
                    )}
                    {review && (
                      <TeamDiscussion
                        review={review}
                        interventions={workspace.interventions}
                        cites={cites}
                      />
                    )}
                  </section>
                )}
                {tab === 'Compare branches' && (
                  <section>
                    <div className="section-heading">
                      <div>
                        <h2>Branch the Deal</h2>
                        <p>
                          See how new evidence changes the investigation, while keeping the original
                          intact.
                        </p>
                      </div>
                      <button
                        className="secondary"
                        disabled={isClosed}
                        onClick={() => setModal('branch')}
                      >
                        <Plus size={16} />
                        New scenario
                      </button>
                    </div>
                    {workspace.branches.length < 2 ? (
                      <div className="empty-state">
                        <GitBranch size={30} />
                        <h3>One deal. More than one possibility.</h3>
                        <p>
                          Create a branch, introduce a hypothetical or new evidence, then rerun the
                          team.
                        </p>
                        <button className="primary" onClick={() => setModal('branch')}>
                          Create your first branch
                        </button>
                      </div>
                    ) : (
                      <>
                        <BranchComparison
                          workspace={workspace}
                          onCitation={(r, c) => {
                            const document = r.snapshot.documents.find(
                              (d) => d.id === c.documentId,
                            );
                            if (document) setEvidence({ document, citation: c });
                          }}
                          onFinding={(r, f) => {
                            pendingComparisonFinding.current = {
                              branchId: r.branchId,
                              reviewId: r.id,
                              finding: f,
                            };
                            if (branchId !== r.branchId) setBranchId(r.branchId);
                            else {
                              setReviewId(r.id);
                              if (reviewId === r.id) {
                                pendingComparisonFinding.current = null;
                                setTab('Investigation');
                                openFinding(f);
                              }
                            }
                          }}
                        />
                      </>
                    )}
                  </section>
                )}
                {tab === 'Brief & notes' && (
                  <NotesView
                    workspace={workspace}
                    review={review}
                    branchId={branchId}
                    isClosed={isClosed}
                    busy={busy}
                    note={note}
                    setNote={setNote}
                    cites={cites}
                    onFinding={(finding) => {
                      setTab('Investigation');
                      openFinding(finding);
                    }}
                    onSave={() =>
                      void runCommand(async () => {
                        await api('/notes', { ...createCaseCommand(), text: note });
                        setNote('');
                        await refresh();
                      })
                    }
                  />
                )}
                {selected && tab === 'Investigation' && (
                  <section
                    className="finding-detail"
                    ref={findingDetailRef}
                    tabIndex={-1}
                    aria-labelledby="finding-detail-title"
                  >
                    <div className="section-heading">
                      <span className="eyebrow">
                        SELECTED FINDING · {roleNames[selected.reviewer]}
                      </span>
                      <button
                        aria-label="Close finding"
                        className="icon-button"
                        onClick={() => setSelected(null)}
                      >
                        <X size={18} />
                      </button>
                    </div>
                    <h2 id="finding-detail-title">{selected.title}</h2>
                    <FindingAssessment finding={selected} cites={cites} />
                    {selected.validationWarnings.map((x) => (
                      <p className="error" key={x}>
                        {x}
                      </p>
                    ))}
                    <button
                      className="primary"
                      disabled={
                        isClosed ||
                        !current ||
                        !['running', 'paused', 'completed'].includes(review?.status || '')
                      }
                      onClick={() => {
                        setQuestion('');
                        setAttach(false);
                        setModal('challenge');
                      }}
                    >
                      <MessageSquare size={16} />
                      Challenge this finding
                    </button>
                  </section>
                )}
                {tab !== 'Team discussion' && workspace.interventions.length > 0 && (
                  <section className="intervention-log">
                    <h3>Your questions at the table</h3>
                    {workspace.interventions.map((i) => (
                      <article key={i.id}>
                        <p className="finding-owner">
                          {(() => {
                            const finding = workspace.reviews
                              .find((r) => r.id === i.reviewId)
                              ?.findings.find((f) => f.id === i.findingId);
                            return finding
                              ? `${roleNames[finding.reviewer]} · ${finding.title}`
                              : 'Earlier review · finding unavailable';
                          })()}
                        </p>
                        <span className={`pill ${i.state === 'completed' ? 'success' : ''}`}>
                          {i.state}
                        </span>
                        <strong>{i.text}</strong>
                        {i.response && (
                          <p>
                            <b>{i.disposition}: </b>
                            {i.response}
                          </p>
                        )}
                        {i.error && <p className="error">{i.error}</p>}
                      </article>
                    ))}
                  </section>
                )}
              </div>
              {evidence && (
                <PdfViewer
                  document={evidence.document}
                  citation={evidence.citation}
                  onClose={() => setEvidence(null)}
                  onReference={(citation) => setEvidence({ ...evidence, citation })}
                />
              )}
            </div>
            <footer className="footer">
              <span>THE UNDERWRITING ROOM / PROTOTYPE</span>
              <span>Synthetic material · Demonstration rules · Human investigation</span>
            </footer>
          </div>
        </main>
      </div>
      {caseDialog && (
        <CaseDialog
          onStale={setCaseDialog}
          target={caseDialog}
          onClose={() => setCaseDialog(null)}
          onCreated={(id) => {
            caseBranches.current[workspace.case.id] = branchId;
            setWorkspace(null);
            setBranchId(id);
            setPage('workspace');
            setTab('Documents');
            setUpload(null);
            setUploadFiles([]);
            setReplaceId('');
            setNote('');
            setError('');
            setCasesRevision((n) => n + 1);
          }}
          onUpdated={async () => {
            await refresh();
            setCasesRevision((n) => n + 1);
          }}
        />
      )}
      {modal === 'branch' && (
        <Modal title="Explore another version of the deal" onClose={() => setModal(null)}>
          <p className="modal-intro">
            A new branch keeps the original documents and review intact. Hypothetical changes are
            clearly labelled assumptions.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runCommand(async () => {
                const b = await api<BranchResponse>('/branches', {
                  ...createCaseCommand(),
                  name: branchName,
                  closingDate: date,
                  assumption,
                });
                setBranchId(b.id);
                setModal(null);
                setTab('Documents');
              });
            }}
          >
            <label>
              Scenario name
              <input
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                required
                maxLength={80}
              />
            </label>
            <label>
              Hypothetical closing date
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </label>
            <label>
              What would you like to explore?
              <textarea
                value={assumption}
                onChange={(e) => setAssumption(e.target.value)}
                placeholder="For example: What changes if the seller’s authorization arrives?"
                maxLength={2000}
              />
            </label>
            <div className="modal-footer">
              <button type="button" className="secondary" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button className="primary" disabled={isClosed || busy}>
                <GitBranch size={16} />
                Create branch
              </button>
            </div>
          </form>
          {error && <p className="error">{error}</p>}
        </Modal>
      )}
      {modal === 'challenge' && selected && (
        <Modal title="Bring a question to the table" onClose={() => setModal(null)}>
          <div className="challenge-target">
            <span className={`role-avatar ${selected.reviewer}`}>
              {roleInitials[selected.reviewer]}
            </span>
            <div>
              <small>{roleNames[selected.reviewer]}</small>
              <strong>{selected.title}</strong>
            </div>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runCommand(async () => {
                await api('/interventions', {
                  ...createCaseCommand(),
                  reviewId: review!.id,
                  findingId: selected.id,
                  kind: attach ? 'evidence' : 'challenge',
                  text: question,
                  ...(attach && evidence?.citation ? { citation: evidence.citation } : {}),
                });
                setModal(null);
                await refresh();
              });
            }}
          >
            <ChallengeInput
              value={question}
              onChange={setQuestion}
              onActiveChange={setVoiceActive}
              disabled={isClosed || busy}
            />
            {evidence?.citation && (
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={attach}
                  onChange={(e) => setAttach(e.target.checked)}
                />
                Attach {evidence.citation.documentId}, page {evidence.citation.page}
              </label>
            )}
            <p className="form-hint">
              {isRunning
                ? 'Your intervention will queue. The team pauses at the next completed stage.'
                : 'The specialist will respond, then the lead updates the brief.'}{' '}
              Unsupported assertions remain unverified. Use Branch the Deal for hypotheticals.
            </p>
            <button className="primary" disabled={busy || voiceActive}>
              <Send size={16} />
              Submit to reviewer
            </button>
          </form>
          {error && <p className="error">{error}</p>}
        </Modal>
      )}
      {modal === 'upload' && (
        <Modal title="Add documentary evidence" onClose={() => setModal(null)}>
          <p className="modal-intro">
            Text PDFs only · 10 MB · 20 pages per file · 100 active pages. Uploading changes the
            revision and requires a full review.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runCommand(async () => {
                let revision = workspace.branch.revision;
                for (const file of uploadFiles.length ? uploadFiles : [upload!]) {
                  const form = new FormData();
                  for (const [k, v] of Object.entries({
                    ...createCaseCommand(),
                    expectedRevision: revision,
                  }))
                    form.append(k, String(v));
                  if (replaceId) form.append('replaces', replaceId);
                  form.append('file', file);
                  try {
                    const result = await api<UploadResult>('/documents', form);
                    revision = result.branch.revision;
                    setUploadFiles((files) => files.filter((pending) => pending !== file));
                  } catch (error) {
                    await refresh();
                    throw error;
                  }
                }
                setModal(null);
                setUpload(null);
                setUploadFiles([]);
                await refresh();
              });
            }}
          >
            <label
              className="batch-upload-zone"
              onDragOver={(e) => {
                e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (busy) return;
                const files = Array.from(e.dataTransfer.files);
                if (files.some((f) => !f.name.toLowerCase().endsWith('.pdf'))) {
                  setError('Please select PDF files. Extract ZIP files before uploading.');
                  return;
                }
                if (replaceId && files.length > 1) {
                  setError(
                    'Choose one PDF when replacing a document, or select Add as new evidence to upload a batch.',
                  );
                  return;
                }
                setError('');
                setUploadFiles(files);
                setUpload(files[0] || null);
              }}
            >
              <Upload size={24} aria-hidden="true" />
              <strong>
                {replaceId
                  ? 'Choose a replacement PDF'
                  : 'Drop all your PDFs here, or select them together'}
              </strong>
              <span>
                {replaceId
                  ? 'One file replaces the selected document.'
                  : 'In the file picker, press Ctrl+A to select all PDFs in the folder, or hold Ctrl to select several.'}
              </span>
              <input
                key={replaceId}
                aria-label={replaceId ? 'Replacement PDF' : 'PDF files'}
                type="file"
                multiple={!replaceId}
                accept="application/pdf,.pdf"
                disabled={busy}
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  setUploadFiles(files);
                  setUpload(files[0] || null);
                }}
              />
            </label>
            <label>
              Replace an active document?
              <select
                disabled={busy}
                value={replaceId}
                onChange={(e) => {
                  setReplaceId(e.target.value);
                  setUploadFiles([]);
                  setUpload(null);
                }}
              >
                <option value="">Add as new evidence</option>
                {workspace.snapshot.documents.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </select>
            </label>
            {!!uploadFiles.length && (
              <div className="batch-upload-selection" role="status">
                <strong>
                  {uploadFiles.length} PDF{uploadFiles.length === 1 ? '' : 's'}{' '}
                  {busy ? 'remaining' : 'selected'}
                </strong>
                <ul>
                  {uploadFiles.map((file, i) => (
                    <li key={`${file.name}-${i}`}>{file.name}</li>
                  ))}
                </ul>
              </div>
            )}
            <button className="primary" disabled={busy || !upload}>
              <Upload size={16} />
              {busy
                ? 'Uploading…'
                : replaceId
                  ? 'Replace document'
                  : `Upload all${uploadFiles.length ? ` (${uploadFiles.length})` : ''}`}
            </button>
          </form>
          {error && <p className="error">{error}</p>}
        </Modal>
      )}
    </div>
  );
}

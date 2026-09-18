const handleDelete = (id: number) => {
  setMenuOpenId(null);

  // Parent owns the actual deletion + confirmation modal.
  onDeleteSession(id);

  // Close only after the delete request has been handed to the parent.
  onClose();

  setPinnedIds(prev => {
    const next = prev.filter(p => Number(p) !== Number(id));
    savePinnedIds(next);
    return next;
  });
};


const normalizedSessions = sessions
  .map(session => ({ ...session, id: Number(session.id) }))
  .filter(session => Number.isFinite(session.id));

const normalizedListProps = {
  ...listProps,
  sessions: normalizedSessions,
};

// Collapsed rail: replace sessions.length with normalizedSessions.length.
<IconTooltip label={`Chats (${normalizedSessions.length})`}>
  <button
    onClick={expandDesktop}
    aria-label="Chats"
    className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-all"
  >
    <MessageCircle className="w-[19px] h-[19px]" strokeWidth={1.7} />
  </button>
</IconTooltip>

// Mobile SessionList:
<SessionList
  {...normalizedListProps}
  onClose={onMobileClose}
  focusSearchOnMount={false}
/>

// Desktop SessionList:
<SessionList
  {...normalizedListProps}
  onClose={collapseDesktop}
  focusSearchOnMount={focusSearch}
/>

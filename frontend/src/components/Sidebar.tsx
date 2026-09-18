const handleDelete = (id: number) => {
  setMenuOpenId(null);


  onDeleteSession(id);


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


<IconTooltip label={`Chats (${normalizedSessions.length})`}>
  <button
    onClick={expandDesktop}
    aria-label="Chats"
    className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-all"
  >
    <MessageCircle className="w-[19px] h-[19px]" strokeWidth={1.7} />
  </button>
</IconTooltip>


<SessionList
  {...normalizedListProps}
  onClose={onMobileClose}
  focusSearchOnMount={false}
/>


<SessionList
  {...normalizedListProps}
  onClose={collapseDesktop}
  focusSearchOnMount={focusSearch}
/>

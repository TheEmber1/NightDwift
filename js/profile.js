(() => {
  const config = window.NIGHTDWIFT_SUPABASE || {};
  const ready = Boolean(config.url && config.anonKey && window.supabase);
  const client = ready ? window.supabase.createClient(config.url, config.anonKey) : null;
  const avatars = [
    { id: 'skyline', label: 'R34' },
    { id: 'supra', label: 'A80' },
    { id: 'porsche', label: '911' },
    { id: 'rx7', label: 'FD' },
    { id: 'silvia', label: 'S15' },
    { id: 'ae86', label: '86' }
  ];
  let user = null, profile = null, busy = false, modalOpen = false, socialBusy = false;
  let publicProfileRequest = 0, viewingProfileId = null, publicProfile = null;
  let profileCarData = null;
  let lastRunSyncError = '';
  const runSyncs = new Map();
  let gameSaveHandler = null;
  let gameSaveSyncUser = null;
  let gameSaveSyncPromise = null;
  let gameSaveWrites = Promise.resolve();
  let gameSaveRevision = 0;
  const $ = id => document.getElementById(id);
  const overlay = $('profile-overlay');
  const form = $('profile-form');
  const status = $('profile-status');
  let returnFocus = null;
  const DEV_PLAYER_TAG = 'CAYBZ#F66865D2F18B';
  const isDevProfile = player =>
    String(player?.player_tag || '').trim().toUpperCase() === DEV_PLAYER_TAG ||
    player?.is_dev === true;

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const setStatus = (message, isError = false) => {
    status.textContent = message;
    status.classList.toggle('error', isError);
  };
  const setBusy = value => {
    busy = value;
    form.querySelectorAll('button,input').forEach(element => { element.disabled = busy; });
  };
  const initial = () => {
    overlay.querySelector('.profile-dialog').setAttribute('aria-labelledby', 'profile-auth-title');
    $('profile-auth').hidden = false;
    $('profile-account').hidden = true;
    $('profile-public').hidden = true;
    $('profile-signup-fields').hidden = true;
    $('profile-auth-title').textContent = 'SIGN IN';
    $('profile-submit').textContent = 'SIGN IN';
    $('profile-resend').hidden = true;
    $('profile-switch').textContent = 'NEW HERE? CREATE AN ACCOUNT';
    $('profile-name').required = false;
  };
  const formatTime = seconds => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds % 3600 / 60);
    return hours ? `${hours}H ${minutes}M` : `${minutes}M`;
  };
  const renderCarAvatar = (element, carId, savedSetup, fallbackAvatar) => {
    const spec = typeof CAR_SPECS !== 'undefined' ? CAR_SPECS[carId] : null;
    if (!spec || typeof drawCar !== 'function') {
      element.classList.remove('car-profile-avatar');
      element.replaceChildren();
      element.textContent = avatars.find(item => item.id === fallbackAvatar)?.label || 'ND';
      return;
    }

    const setup = savedSetup && typeof savedSetup === 'object' && !Array.isArray(savedSetup)
      ? savedSetup : null;
    const colorOptions = {
      factory: null, blue: '#315b98', red: '#b74438', ivory: '#e5dcc3',
      yellow: '#e2bd43', jade: '#508575', purple: '#815c85'
    };
    const custom = setup ? {
      color: Object.hasOwn(colorOptions, setup.color) ? colorOptions[setup.color] : null,
      paint: ['factory', 'stripes', 'two-tone', 'panda'].includes(setup.paint) ? setup.paint : 'factory',
      wing: ['stock', 'gt', 'ducktail', 'none'].includes(setup.wing) ? setup.wing : 'stock',
      wheels: ['steel', 'bronze', 'white', 'gunmetal', 'gold'].includes(setup.wheels) ? setup.wheels : 'steel'
    } : null;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 80;
    canvas.className = 'car-profile-avatar-image';
    const context = canvas.getContext('2d');
    context.setTransform(3.2, 0, 0, 3.2, 40, 40);
    drawCar(context, spec, 0, 0, -Math.PI / 2, { shadow: false, custom });
    element.classList.add('car-profile-avatar');
    element.replaceChildren(canvas);
  };
  const showStats = async (includeFriends = true) => {
    if (!client || !user) return;
    try {
      const { data, error } = await client.from('profiles')
        .select('display_name, player_tag, avatar, xp, total_score, best_score, total_play_seconds, runs_completed')
        .eq('id', user.id).single();
      if (error) {
        setStatus(`PROFILE LOAD FAILED: ${error.message}`, true);
        return;
      }
      profile = data;
      profileCarData = null;
      const localCar = gameSaveHandler?.getProfileCarData?.();
      if (localCar?.carId) profileCarData = localCar;
      let profileMessage = lastRunSyncError;
      let profileMessageIsError = Boolean(lastRunSyncError);
      try {
        const social = await getPublicProfile(user.id);
        if (!profileCarData?.carId) {
          profileCarData = { carId: social.car_id, setup: social.car_setup };
        }
        $('profile-followers-count').textContent = Number(social.follower_count).toLocaleString();
        $('profile-following-count').textContent = Number(social.following_count).toLocaleString();
      } catch (socialError) {
        profileMessage = `FOLLOW COUNTS FAILED TO LOAD: ${socialError.message || 'Network error.'}`;
        profileMessageIsError = true;
      }
      $('profile-account-name').textContent = profile.display_name;
      $('profile-dev-tag').hidden = !isDevProfile(profile);
      $('profile-dev-banner').hidden = !isDevProfile(profile);
      $('profile-account-email').textContent = user.email || '';
      $('profile-player-tag').textContent = profile.player_tag;
      renderCarAvatar($('profile-account-avatar'), profileCarData?.carId, profileCarData?.setup, profile.avatar);
      renderCarAvatar($('profile-header-avatar'), profileCarData?.carId, profileCarData?.setup, profile.avatar);
      $('profile-stats').innerHTML = [
        ['XP', Number(profile.xp).toLocaleString()],
        ['TOTAL SCORE', Number(profile.total_score).toLocaleString()],
        ['BEST SCORE', Number(profile.best_score).toLocaleString()],
        ['TIME PLAYED', formatTime(Number(profile.total_play_seconds))],
        ['RUNS FINISHED', Number(profile.runs_completed).toLocaleString()]
      ].map(([label, value]) => `<div class="profile-stat"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
      $('profile-auth').hidden = true;
      $('profile-account').hidden = false;
      $('profile-public').hidden = true;
      overlay.querySelector('.profile-dialog').setAttribute('aria-labelledby', 'profile-account-name');
      setStatus(profileMessage, profileMessageIsError);
      if (includeFriends) await refreshFriends();
    } catch (error) {
      setStatus(`PROFILE LOAD FAILED: ${error.message || 'Network error.'}`, true);
    }
  };
  const open = async () => {
    if (overlay.hidden) returnFocus = document.activeElement;
    modalOpen = true;
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    if (!ready) {
      initial();
      $('profile-auth-title').textContent = 'PROFILE SETUP';
      $('profile-form-fields').hidden = true;
      $('profile-switch').hidden = true;
      $('profile-submit').hidden = true;
      setStatus(window.supabase
        ? 'ADD YOUR SUPABASE PROJECT URL AND ANON KEY TO js/supabase-config.js, THEN RUN supabase/schema.sql.'
        : 'SUPABASE SDK DID NOT LOAD. CHECK YOUR CONNECTION, THEN RELOAD.');
      return;
    }
    $('profile-public').hidden = true;
    $('profile-form-fields').hidden = false;
    $('profile-switch').hidden = false;
    $('profile-submit').hidden = false;
    if (user) await showStats();
    else {
      initial();
      setStatus('');
      $('profile-email').focus();
    }
  };
  const close = () => {
    modalOpen = false;
    publicProfileRequest++;
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    setStatus('');
    if (returnFocus instanceof HTMLElement && returnFocus.isConnected) returnFocus.focus();
    else $('profile-button').focus();
    returnFocus = null;
  };
  const handleController = pressed => {
    if (!modalOpen) return false;
    if (pressed.menu) close();
    else Input.navigate(overlay.querySelector('.profile-dialog'), pressed);
    return true;
  };
  const refreshHeader = () => {
    const avatar = $('profile-header-avatar');
    const name = $('profile-header-label');
    if (user && profile) renderCarAvatar(
      avatar, profileCarData?.carId, profileCarData?.setup, profile.avatar
    );
    else {
      avatar.classList.remove('car-profile-avatar');
      avatar.replaceChildren();
      avatar.textContent = '?';
    }
    name.textContent = user && profile ? profile.display_name : 'PROFILE';
    $('profile-button').setAttribute('aria-label', user && profile ? `Profile: ${profile.display_name}` : 'Open profile and sign in');
  };
  const gameSaveStorageKey = userId => `drift.profileSave.${userId}`;
  const readLocalGameSave = userId => {
    try {
      const saved = JSON.parse(localStorage.getItem(gameSaveStorageKey(userId)));
      return saved && typeof saved === 'object' && saved.data && typeof saved.data === 'object'
        ? saved : null;
    } catch (error) {
      console.error('Unable to read local profile save:', error);
      return null;
    }
  };
  const cacheLocalGameSave = (userId, data, updatedAt) => {
    try {
      localStorage.setItem(gameSaveStorageKey(userId), JSON.stringify({ data, updatedAt }));
    } catch (error) {
      console.error('Unable to cache local profile save:', error);
    }
  };
  const cacheGameSave = data => {
    if (!user) return;
    const updatedAt = Date.now() + (++gameSaveRevision / 1000);
    cacheLocalGameSave(user.id, data, updatedAt);
  };
  const refreshProfile = async () => {
    if (!client) return;
    try {
      const { data, error } = await client.auth.getSession();
      if (error) {
        setStatus(`SESSION CHECK FAILED: ${error.message}`, true);
        return;
      }
      user = data.session?.user || null;
      if (user) {
        await showStats();
        await syncGameSave();
      } else {
        profile = null;
        gameSaveSyncUser = null;
      }
      refreshHeader();
    } catch (error) {
      setStatus(`SESSION CHECK FAILED: ${error.message || 'Network error.'}`, true);
    }
  };
  const syncGameSave = async () => {
    if (!client || !user || !gameSaveHandler || gameSaveSyncUser === user.id) return;
    if (gameSaveSyncPromise) await gameSaveSyncPromise;
    if (!user || !gameSaveHandler || gameSaveSyncUser === user.id) return;
    const syncingUser = user;
    gameSaveSyncUser = syncingUser.id;
    gameSaveSyncPromise = (async () => {
      try {
        const { data: remote, error } = await client.rpc('load_player_save');
        if (error) throw error;
        if (!user || user.id !== syncingUser.id) return;
        const accountSave = readLocalGameSave(syncingUser.id);
        const local = gameSaveHandler.getLocalSave(
          syncingUser.id, Boolean(remote), accountSave
        );
        if (!remote) {
          const updatedAt = await saveGameData(local.data, syncingUser.id);
          gameSaveHandler.setSaveTimestamp(updatedAt, syncingUser.id, local.data);
        } else {
          const remoteTime = Date.parse(remote.updated_at);
          if (local.updatedAt > remoteTime) {
            const updatedAt = await saveGameData(local.data, syncingUser.id);
            gameSaveHandler.setSaveTimestamp(updatedAt, syncingUser.id, local.data);
          } else {
            gameSaveHandler.applyRemoteSave(remote.save_data, remote.updated_at, syncingUser.id);
          }
        }
      } catch (error) {
        gameSaveSyncUser = null;
        console.error('Unable to sync player save:', error);
        if (modalOpen) setStatus(`GAME SAVE SYNC FAILED: ${error.message || 'Network error.'}`, true);
      } finally {
        gameSaveSyncPromise = null;
      }
    })();
    await gameSaveSyncPromise;
  };
  const saveGameData = (data, expectedUserId) => {
    if (!client || !user || (expectedUserId !== undefined && user.id !== expectedUserId))
      return Promise.resolve(null);
    const playerId = user.id;
    const localUpdatedAt = Date.now() + (++gameSaveRevision / 1000);
    cacheLocalGameSave(playerId, data, localUpdatedAt);
    const write = gameSaveWrites.catch(() => {}).then(async () => {
      if (!user || user.id !== playerId) return null;
      const { data: updatedAt, error } = await client.rpc('save_player_save', {
        p_save_data: data
      });
      if (error) throw error;
      const currentLocal = readLocalGameSave(playerId);
      if (currentLocal && currentLocal.updatedAt === localUpdatedAt) {
        cacheLocalGameSave(playerId, data, Date.parse(updatedAt) || localUpdatedAt);
      }
      return updatedAt;
    });
    gameSaveWrites = write.catch(error => {
      console.error('Unable to save player data:', error);
      if (modalOpen) setStatus(`GAME SAVE FAILED: ${error.message || 'Network error.'}`, true);
    });
    return write;
  };
  const recordRun = (mode, score, seconds, completed, runId) => {
    if (!client || seconds < 1 || !runId) return Promise.resolve();
    const previous = runSyncs.get(runId) || Promise.resolve();
    const current = previous.catch(() => {}).then(async () => {
      try {
        if (!user) await refreshProfile();
        if (!user) return;
        const { error } = await client.rpc('record_game_run', {
          p_run_id: runId,
          p_mode: mode === 'free' ? 'freeplay' : mode,
          p_score: Math.max(0, Math.floor(score)),
          p_duration_seconds: Math.min(86400, Math.max(1, Math.floor(seconds))),
          p_completed: Boolean(completed)
        });
        if (error) throw error;
        lastRunSyncError = '';
        await showStats(false);
      } catch (error) {
        lastRunSyncError = `RUN SYNC FAILED: ${error.message || 'Network error.'}`;
        console.error(lastRunSyncError);
        if (modalOpen) setStatus(lastRunSyncError, true);
      }
    });
    runSyncs.set(runId, current);
    current.then(() => {
      if (runSyncs.get(runId) === current) runSyncs.delete(runId);
    });
    return current;
  };
  const rpc = async (name, args = {}) => {
    if (!client || !user) throw new Error('Sign in to use friends and challenges.');
    const { data, error } = await client.rpc(name, args);
    if (error) throw error;
    return data;
  };
  const renderPlayer = (player, controls) => {
    const row = document.createElement('div');
    row.className = 'friend-entry';
    const avatar = document.createElement('span');
    avatar.className = 'profile-avatar';
    renderCarAvatar(avatar, player.car_id, player.car_setup, player.avatar);
    const nameBlock = document.createElement('div');
    const name = document.createElement('button');
    name.type = 'button';
    name.className = 'profile-name-link';
    name.textContent = player.display_name;
    name.setAttribute('aria-label', `View ${player.display_name}'s profile`);
    name.addEventListener('click', () => viewPublicProfile(player.player_id));
    if (isDevProfile(player)) {
      const badge = document.createElement('span');
      badge.className = 'dev-badge';
      badge.textContent = 'DEV';
      name.append(badge);
    }
    const tag = document.createElement('small');
    tag.textContent = player.player_tag || '';
    nameBlock.append(name, tag);
    row.append(avatar, nameBlock, controls);
    return row;
  };
  const refreshFriends = async () => {
    if (!client || !user || socialBusy) return;
    socialBusy = true;
    const list = $('friend-list');
    list.replaceChildren(Object.assign(document.createElement('p'), {
      className: 'friend-empty', textContent: 'LOADING FRIENDS…'
    }));
    try {
      const relationships = await rpc('list_friendships');
      list.replaceChildren();
      if (!relationships.length) {
        list.append(Object.assign(document.createElement('p'), {
          className: 'friend-empty', textContent: 'NO FRIENDS YET. FIND SOMEONE BY THEIR FRIEND CODE.'
        }));
        return;
      }
      for (const relationship of relationships) {
        const actions = document.createElement('div');
        actions.className = 'friend-row';
        if (relationship.relationship_status === 'pending' && relationship.incoming) {
          const accept = document.createElement('button');
          accept.type = 'button'; accept.textContent = 'ACCEPT';
          accept.addEventListener('click', () => respondFriend(relationship.player_id, true));
          const decline = document.createElement('button');
          decline.type = 'button'; decline.textContent = 'DECLINE';
          decline.addEventListener('click', () => respondFriend(relationship.player_id, false));
          actions.append(accept, decline);
        } else if (relationship.relationship_status === 'pending') {
          const pending = document.createElement('small');
          pending.textContent = 'SENT';
          actions.append(pending);
        } else {
          const remove = document.createElement('button');
          remove.type = 'button'; remove.textContent = 'REMOVE';
          remove.addEventListener('click', () => removeFriend(relationship.player_id));
          actions.append(remove);
        }
        list.append(renderPlayer(relationship, actions));
      }
    } catch (error) {
      list.replaceChildren(Object.assign(document.createElement('p'), {
        className: 'friend-empty', textContent: `FRIENDS FAILED TO LOAD: ${error.message}`
      }));
    } finally { socialBusy = false; }
  };
  const showSearchResults = players => {
    const results = $('friend-search-results');
    results.replaceChildren();
    if (!players.length) {
      results.append(Object.assign(document.createElement('p'), {
        className: 'friend-empty', textContent: 'NO PLAYER FOUND. CHECK THE FRIEND CODE.'
      }));
      return;
    }
    for (const player of players) {
      const add = document.createElement('button');
      add.type = 'button'; add.textContent = 'ADD';
      add.addEventListener('click', () => sendFriendRequest(player.player_id));
      const controls = document.createElement('div');
      controls.className = 'friend-row'; controls.append(add);
      results.append(renderPlayer(player, controls));
    }
  };
  const searchFriends = async () => {
    if (socialBusy) return;
    const tag = $('friend-code-input').value.trim();
    if (!tag) { setStatus('ENTER A FRIEND CODE FIRST.', true); return; }
    socialBusy = true;
    try { showSearchResults(await rpc('search_players', { p_tag: tag })); }
    catch (error) { setStatus(`PLAYER SEARCH FAILED: ${error.message}`, true); }
    finally { socialBusy = false; }
  };
  const sendFriendRequest = async playerId => {
    if (socialBusy) return;
    socialBusy = true;
    try {
      await rpc('send_friend_request', { p_player_id: playerId });
      setStatus('FRIEND REQUEST SENT.');
      $('friend-search-results').replaceChildren();
    } catch (error) { setStatus(`FRIEND REQUEST FAILED: ${error.message}`, true); }
    finally { socialBusy = false; }
    await refreshFriends();
  };
  const respondFriend = async (playerId, accept) => {
    if (socialBusy) return;
    socialBusy = true;
    try {
      await rpc('respond_friend_request', { p_player_id: playerId, p_accept: accept });
      setStatus(accept ? 'FRIEND REQUEST ACCEPTED.' : 'FRIEND REQUEST DECLINED.');
    } catch (error) { setStatus(`REQUEST UPDATE FAILED: ${error.message}`, true); }
    finally { socialBusy = false; }
    await refreshFriends();
  };
  const removeFriend = async playerId => {
    if (socialBusy) return;
    socialBusy = true;
    try {
      await rpc('remove_friend', { p_player_id: playerId });
      setStatus('FRIEND REMOVED.');
    } catch (error) { setStatus(`REMOVE FRIEND FAILED: ${error.message}`, true); }
    finally { socialBusy = false; }
    await refreshFriends();
  };
  const getFriendTimes = async trackId => rpc('get_friend_times', { p_track_id: trackId });
  const getPublicProfile = async playerId => {
    if (!client) throw new Error('Profile service is unavailable.');
    const { data, error } = await client.rpc('get_public_profile', { p_player_id: playerId });
    if (error) throw error;
    if (!data?.length) throw new Error('Player not found.');
    return data[0];
  };
  const viewPublicProfile = async playerId => {
    if (!client) { await open(); return; }
    if (overlay.hidden) returnFocus = document.activeElement;
    const request = ++publicProfileRequest;
    viewingProfileId = playerId;
    modalOpen = true;
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    overlay.querySelector('.profile-dialog').setAttribute('aria-labelledby', 'public-profile-name');
    $('profile-auth').hidden = true;
    $('profile-account').hidden = true;
    $('profile-public').hidden = false;
    $('public-profile-name').textContent = 'LOADING PROFILE…';
    $('public-profile-followers').textContent = '—';
    $('public-profile-following').textContent = '—';
    $('public-profile-follow').hidden = true;
    setStatus('');
    try {
      const data = await getPublicProfile(playerId);
      if (request !== publicProfileRequest) return;
      publicProfile = data;
      $('public-profile-name').textContent = data.display_name;
      renderCarAvatar($('public-profile-avatar'), data.car_id, data.car_setup, data.avatar);
      $('public-profile-dev-tag').hidden = !isDevProfile(data);
      $('public-profile-dev-banner').hidden = !isDevProfile(data);
      $('public-profile-followers').textContent = Number(data.follower_count).toLocaleString();
      $('public-profile-following').textContent = Number(data.following_count).toLocaleString();
      const followButton = $('public-profile-follow');
      followButton.hidden = data.is_self;
      followButton.textContent = !user ? 'SIGN IN TO FOLLOW'
        : data.is_following ? 'UNFOLLOW' : 'FOLLOW';
    } catch (error) {
      if (request !== publicProfileRequest) return;
      publicProfile = null;
      $('public-profile-name').textContent = 'PROFILE UNAVAILABLE';
      setStatus(`PROFILE FAILED TO LOAD: ${error.message || 'Network error.'}`, true);
    }
  };
  const togglePublicFollow = async () => {
    if (!viewingProfileId || socialBusy) return;
    if (!user) {
      $('profile-public').hidden = true;
      initial();
      $('profile-form-fields').hidden = false;
      $('profile-switch').hidden = false;
      $('profile-submit').hidden = false;
      setStatus('SIGN IN TO FOLLOW THIS PLAYER.');
      $('profile-email').focus();
      return;
    }
    if (!publicProfile || publicProfile.is_self) return;
    socialBusy = true;
    $('public-profile-follow').disabled = true;
    try {
      await rpc(publicProfile.is_following ? 'unfollow_player' : 'follow_player', {
        p_player_id: viewingProfileId
      });
    } catch (error) {
      setStatus(`FOLLOW UPDATE FAILED: ${error.message || 'Network error.'}`, true);
      socialBusy = false;
      $('public-profile-follow').disabled = false;
      return;
    }
    const followedProfileId = viewingProfileId;
    await viewPublicProfile(followedProfileId);
    try {
      const own = await getPublicProfile(user.id);
      $('profile-followers-count').textContent = Number(own.follower_count).toLocaleString();
      $('profile-following-count').textContent = Number(own.following_count).toLocaleString();
    } catch (error) {
      setStatus(`FOLLOW UPDATED, BUT COUNTS FAILED TO REFRESH: ${error.message || 'Network error.'}`, true);
    } finally {
      socialBusy = false;
      $('public-profile-follow').disabled = false;
    }
  };
  const recordTimeAttack = async (trackId, timeMs, carId, carSetup) => {
    if (!client || !user) return false;
    try {
      const { error } = await client.rpc('record_time_attack_car', {
        p_track_id: trackId,
        p_time_ms: Math.max(1, Math.floor(timeMs)),
        p_car_id: carId,
        p_car_setup: carSetup
      });
      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Unable to save time attack:', error);
      if (modalOpen) setStatus(`TIME ATTACK SYNC FAILED: ${error.message}`);
      return false;
    }
  };
  const getLeaderboard = async trackId => {
    const { data, error } = await client.rpc('get_time_attack_leaderboard', {
      p_track_id: trackId
    });
    if (error) throw error;
    return data || [];
  };

  $('profile-button').addEventListener('click', open);
  $('public-profile-follow').addEventListener('click', togglePublicFollow);
  $('profile-close').addEventListener('click', close);
  overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
  document.addEventListener('keydown', event => {
    if (modalOpen && event.key === 'Escape') { event.preventDefault(); close(); }
  });
  $('profile-switch').addEventListener('click', () => {
    const creating = $('profile-signup-fields').hidden;
    $('profile-signup-fields').hidden = !creating;
    $('profile-resend').hidden = true;
    $('profile-auth-title').textContent = creating ? 'CREATE ACCOUNT' : 'SIGN IN';
    $('profile-submit').textContent = creating ? 'CREATE ACCOUNT' : 'SIGN IN';
    $('profile-switch').textContent = creating ? 'ALREADY HAVE AN ACCOUNT? SIGN IN' : 'NEW HERE? CREATE AN ACCOUNT';
    $('profile-name').required = creating;
    setStatus('');
  });
  $('friend-search-button').addEventListener('click', searchFriends);
  $('friend-code-input').addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); searchFriends(); }
  });
  $('profile-signout').addEventListener('click', async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await client.auth.signOut();
      if (error) { setStatus(`SIGN OUT FAILED: ${error.message}`, true); return; }
      user = null; profile = null; initial(); refreshHeader(); setStatus('SIGNED OUT.');
    } catch (error) {
      setStatus(`SIGN OUT FAILED: ${error.message || 'Network error.'}`, true);
    } finally { setBusy(false); }
  });
  $('profile-resend').addEventListener('click', async () => {
    if (!client || busy) return;
    setBusy(true);
    setStatus('');
    try {
      const { error } = await client.auth.resend({
        type: 'signup',
        email: $('profile-email').value.trim(),
        options: { emailRedirectTo: `${window.location.origin}${window.location.pathname}` }
      });
      if (error) { setStatus(`RESEND FAILED: ${error.message}`, true); return; }
      setStatus('A NEW CONFIRMATION LINK HAS BEEN SENT. CHECK YOUR EMAIL.');
    } catch (error) {
      setStatus(`RESEND FAILED: ${error.message || 'Network error.'}`, true);
    } finally {
      setBusy(false);
    }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!client || busy) return;
    setBusy(true);
    setStatus('');
    const email = $('profile-email').value.trim();
    const password = $('profile-password').value;
    const creating = !$('profile-signup-fields').hidden;
    try {
      const result = creating
        ? await client.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: $('profile-name').value.trim() },
            emailRedirectTo: `${window.location.origin}${window.location.pathname}`
          }
        })
        : await client.auth.signInWithPassword({ email, password });
      if (result.error) { setStatus(result.error.message, true); return; }
      if (creating && !result.data.session) {
        $('profile-resend').hidden = false;
        setStatus('CHECK YOUR EMAIL TO CONFIRM YOUR ACCOUNT, THEN SIGN IN.');
        return;
      }
      user = result.data.user;
      await showStats();
      refreshHeader();
      await syncGameSave();
    } catch (error) {
      setStatus(`ACCOUNT REQUEST FAILED: ${error.message || 'Network error.'}`, true);
    } finally {
      setBusy(false);
    }
  });

  if (client) {
    client.auth.onAuthStateChange((_event, session) => {
      user = session?.user || null;
      if (!user) {
        profile = null;
        profileCarData = null;
        gameSaveSyncUser = null;
        refreshHeader();
        return;
      }
      window.setTimeout(async () => {
        await showStats();
        refreshHeader();
        await syncGameSave();
      }, 0);
    });
  }
  refreshProfile();
  refreshHeader();
  window.Profile = {
    dialogOpen: () => modalOpen,
    recordRun,
    cacheGameSave,
    getUserId: () => user?.id || null,
    setGameSaveHandler(handler) {
      gameSaveHandler = handler;
      if (user) syncGameSave();
    },
    saveGameData,
    isSignedIn: () => Boolean(user),
    open,
    getFriendTimes,
    getLeaderboard,
    viewPublicProfile,
    handleController,
    recordTimeAttack,
    isDevProfile,
    renderCarAvatar
  };
})();

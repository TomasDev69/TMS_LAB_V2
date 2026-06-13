export const state = {
    activeLab: 'yt',
    db: {
        yt: {
            videoIdeas: [], channels: [], toolsData: [], trainingData: [], editorsHubData: [], inspChannels: [], tmsPicks: [], finance: { revenues: [], editorCosts: [], subscriptions: [] }, devTodoList: [], brainstormingText: "", competitorsAnalysis: [], fastIdeas: []
        },
        uf: {
            videoIdeas: [], channels: [], toolsData: [], trainingData: [], editorsHubData: [], inspChannels: [], tmsPicks: [], finance: { revenues: [], editorCosts: [], subscriptions: [] }, devTodoList: [], brainstormingText: "", competitorsAnalysis: [], fastIdeas: []
        },
        '3d': {
            videoIdeas: [], channels: [], toolsData: [], trainingData: [], editorsHubData: [], inspChannels: [], tmsPicks: [], finance: { revenues: [], editorCosts: [], subscriptions: [] }, devTodoList: [], brainstormingText: "", competitorsAnalysis: [], fastIdeas: []
        }
    },
    SCRIPT_URL: localStorage.getItem('creatorhub_script_url') || "",
    videoIdeas: [],
    fastIdeas: [],
    channels: [],
    toolsData: [],
    trainingData: [],
    editorsHubData: [],
    inspChannels: [],
    tmsPicks: [],
    globalFeed: [],
    finance: {
        revenues: [],
        editorCosts: [],
        subscriptions: []
    },
    devTodoList: [],
    brainstormingText: "",
    competitorsAnalysis: [],
    feedDisplayIndex: 0,
    activeChannelId: null,
    activeStatusFilter: 'all',
    currentView: 'idee',
    currentEHTab: 'sfx',
    currentInspTab: 'channels',
    folderStatusCache: {},
    randomIdeaOrder: [],
    globalAudioPlayer: new Audio(),
    currentlyPlayingEHId: null,
    downloadedEHFiles: JSON.parse(localStorage.getItem('creatorhub_eh_downloads') || '[]'),
    TEAM_MEMBERS: ["DG", "Tomas", "Pierò", "GFS", "Noemi", "Alex", "Davide", "Rog", "Camel", "Gatti"],
    CHANNEL_COLORS: ['#3ea6ff','#ff4e4e','#4ade80','#facc15','#f97316','#a855f7','#ec4899','#14b8a6','#f59e0b','#6366f1','#84cc16','#06b6d4'],
    sidebarOpen: true,
    currentlyOpenIdeaId: null,
    isSyncing: false,
    syncError: false,
    files: {
        training: null,
        eh: null,
        editIdeaThumb: null,
        addThumb: null,
        tool: null,
        editChannelAvatar: null,
        channelAvatar: null
    }
};
// Game Configuration
const WORD_COLORS = [
    '#AEC6CF', // Пастельно-голубой
    '#B2E2B2', // Пастельно-зеленый
    '#FFD1DC', // Пастельно-розовый
    '#F4E1D2'  // Пастельно-бежевый
];

const PLACEMENT_ORDER = {
    RANDOM: 'random',
    LINEAR: 'linear',
    CLUSTER: 'cluster'
};

const LETTER_SORT = {
    DIRECT: 'direct',
    KEEP_BASE: 'keep_base',
    MIRROR: 'mirror',
    RANDOM: 'random'
};

// State
let currentLevelIndex = 0;
let LEVELS_DATA = [];
let FULL_DICTIONARY = new Set();
let gameState = {
    columns: [], // Array of arrays (stacks)
    targetWords: [], // Words to find
    foundWords: [], // Found words
    revealedWords: [], // Words revealed by hint but not yet found by player
    hiddenWords: [], // Found hidden words
    selectedTiles: [],
    levelColors: [], // Порядок цветов для текущего уровня
    isColored: false, // Включена ли раскраска на текущем уровне
    isGameActive: false,
    isProcessing: false,
    checkWordTimeout: null
};

// Initial setup
document.addEventListener('DOMContentLoaded', () => {
    initGame();
});

async function initGame() {
    console.log("Initializing game...");
    try {
        const [levelsRes, dictRes] = await Promise.all([
            fetch('levels.json'),
            fetch('russian_dictionary.txt')
        ]);
        
        LEVELS_DATA = await levelsRes.json();
        
        const dictText = await dictRes.text();
        FULL_DICTIONARY = new Set(
            dictText.split('\n')
                .map(word => word.trim().toUpperCase())
                .filter(word => word.length > 0)
        );

        loadLevel(currentLevelIndex);
    } catch (error) {
        console.error("Failed to load game data:", error);
        alert("Ошибка загрузки данных игры. Пожалуйста, убедитесь, что вы запускаете игру через локальный сервер (например, VS Code Live Server).");
    }
    
    document.getElementById('restart-btn').addEventListener('click', restartLevel);
    document.getElementById('hint-btn').addEventListener('click', useHint);
    document.getElementById('bonus-color-btn').addEventListener('click', activateBonusColor);
    document.getElementById('next-level-btn').addEventListener('click', nextLevel);
    document.getElementById('word-panel').addEventListener('click', handleInputPanelClick);
}

function restartLevel() {
    if (gameState.isProcessing) return;
    const levelConfig = LEVELS_DATA[currentLevelIndex];
    if (!levelConfig) return;

    // Находим слова, которые еще не были собраны
    const remainingWords = gameState.targetWords.filter(word => !gameState.foundWords.includes(word));
    
    if (remainingWords.length === 0) return;

    // State Reset
    gameState.selectedTiles = [];
    gameState.columns = Array.from({ length: levelConfig.cols }, () => []);
    
    // UI Updates
    updateSelectionUI();
    
    // Logic Generation with remaining words
    generateLevelWithWords(levelConfig, remainingWords);
    
    // Render
    renderBoard();
}

function generateLevelWithWords(config, words) {
    const allLetters = [];
    const letterSortType = config.difficulty?.letters || LETTER_SORT.DIRECT;

    words.forEach(word => {
        const sortedLetters = sortWordLetters(word, letterSortType);
        sortedLetters.forEach((char, charIndex) => {
            allLetters.push({
                char: char,
                wordIndex: gameState.targetWords.indexOf(word),
                charIndex: charIndex
            });
        });
    });

    const orderType = config.difficulty?.order || PLACEMENT_ORDER.RANDOM;
    
    if (orderType === PLACEMENT_ORDER.LINEAR) {
        let currentCol = 0;
        let currentRow = 0;
        allLetters.forEach((letterData) => {
            const tile = {
                id: `tile-${Date.now()}-${Math.random()}`,
                char: letterData.char,
                colIndex: currentCol,
                wordIndex: letterData.wordIndex,
                selected: false
            };
            gameState.columns[currentCol].push(tile);
            
            currentCol++;
            if (currentCol >= config.cols) {
                currentCol = 0;
                currentRow++;
            }
        });
    } else if (orderType === PLACEMENT_ORDER.CLUSTER) {
        const colHeights = new Array(config.cols).fill(0);
        let lastCol = -1;

        allLetters.forEach((letterData, index) => {
            let colIndex;
            
            // Если это первая буква слова (или вообще первая буква)
            if (letterData.charIndex === 0) {
                // Ищем доступный столбец ближе к левой части
                colIndex = 0;
                while (colIndex < config.cols - 1 && colHeights[colIndex] >= config.rows) {
                    colIndex++;
                }
            } else {
                // Пытаемся упасть рядом или на предыдущую (50/50)
                const options = [];
                // На текущую
                if (colHeights[lastCol] < config.rows) {
                    options.push(lastCol);
                    options.push(lastCol); // 50% шанс
                }
                // Рядом
                if (lastCol > 0 && colHeights[lastCol - 1] < config.rows) {
                    options.push(lastCol - 1);
                }
                if (lastCol < config.cols - 1 && colHeights[lastCol + 1] < config.rows) {
                    options.push(lastCol + 1);
                }

                if (options.length > 0) {
                    colIndex = options[Math.floor(Math.random() * options.length)];
                } else {
                    // Если некуда пасть рядом, ищем любой свободный
                    colIndex = colHeights.findIndex(h => h < config.rows);
                }
            }

            if (colIndex === -1 || colIndex === undefined) {
                colIndex = colHeights.findIndex(h => h < config.rows);
            }

            const tile = {
                id: `tile-${Date.now()}-${Math.random()}`,
                char: letterData.char,
                colIndex: colIndex,
                wordIndex: letterData.wordIndex,
                selected: false
            };
            gameState.columns[colIndex].push(tile);
            colHeights[colIndex]++;
            lastCol = colIndex;
        });
    } else {
        // RANDOM (default)
        const totalLetters = allLetters.length;
        let availableSlots = [];
        
        for (let i = 0; i < totalLetters; i++) {
            availableSlots.push(i % config.cols);
        }

        for (let i = availableSlots.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [availableSlots[i], availableSlots[j]] = [availableSlots[j], availableSlots[i]];
        }

        allLetters.forEach((letterData, index) => {
            const colIndex = availableSlots[index];
            const tile = {
                id: `tile-${Date.now()}-${Math.random()}`,
                char: letterData.char,
                colIndex: colIndex,
                wordIndex: letterData.wordIndex,
                selected: false
            };
            gameState.columns[colIndex].push(tile);
        });
    }
}

function generateLevel(config) {
    generateLevelWithWords(config, gameState.targetWords);
}

function nextLevel() {
    if (gameState.isProcessing) return;
    document.getElementById('win-screen').classList.add('hidden');
    currentLevelIndex++;
    if (currentLevelIndex >= LEVELS_DATA.length) {
        alert("Поздравляем! Вы прошли все уровни!");
        currentLevelIndex = 0;
    }
    loadLevel(currentLevelIndex);
}

function resetSelection() {
    if (gameState.isProcessing) return;
    gameState.selectedTiles = [];
    updateSelectionUI();
    renderBoard();
}

function handleSelectedTileClick(tile) {
    if (gameState.isProcessing) return;
    
    // Проверяем, можно ли отменить эту букву (она должна быть верхней выбранной в своей колонке)
    const colIndex = tile.colIndex;
    const column = gameState.columns[colIndex];
    const tileIndex = column.findIndex(t => t.id === tile.id);
    
    // Если над этой плиткой в этой же колонке есть другие выбранные плитки, отменять нельзя
    const hasSelectedAbove = column.slice(tileIndex + 1).some(t => 
        gameState.selectedTiles.some(st => st.id === t.id)
    );
    
    if (hasSelectedAbove) {
        return; // Нельзя отменить, так как сверху есть другие выбранные буквы
    }
    
    const index = gameState.selectedTiles.findIndex(t => t.id === tile.id);
    if (index !== -1) {
        gameState.selectedTiles.splice(index, 1);
        
        if (gameState.checkWordTimeout) {
            clearTimeout(gameState.checkWordTimeout);
            gameState.checkWordTimeout = null;
        }
        
        updateSelectionUI();
        renderBoard();
    }
}

function loadLevel(levelIndex) {
    const levelConfig = LEVELS_DATA[levelIndex];
    if (!levelConfig) return;

    // UI Updates
    document.getElementById('level-display').textContent = levelConfig.id;
    document.getElementById('game-board').innerHTML = '';
    document.getElementById('target-words-list').innerHTML = '';
    
    // State Reset
    gameState.targetWords = levelConfig.words.map(word => word.trim().toUpperCase());
    if (levelConfig.follow === false) {
        shuffleArray(gameState.targetWords);
    }
    gameState.foundWords = [];
    gameState.revealedWords = [];
    gameState.hiddenWords = [];
    gameState.selectedTiles = [];
    gameState.columns = Array.from({ length: levelConfig.cols }, () => []);
    gameState.isColored = levelConfig.difficulty?.colored ?? true;
    
    // Инициализация цветов для уровня
    gameState.levelColors = [...WORD_COLORS];
    for (let i = gameState.levelColors.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [gameState.levelColors[i], gameState.levelColors[j]] = [gameState.levelColors[j], gameState.levelColors[i]];
    }
    
    // Set fixed height for columns based on rows
    document.documentElement.style.setProperty('--target-rows', levelConfig.rows);
    
    // UI Target Words
    updateTargetWordsUI();
    
    // Logic Generation
    generateLevel(levelConfig);
    
    // Render
    renderBoard();
}

function updateTargetWordsUI() {
    const container = document.getElementById('target-words-list');
    container.innerHTML = '';
    gameState.targetWords.forEach((word, index) => {
        const el = document.createElement('div');
        el.className = 'target-word';
        if (gameState.foundWords.includes(word)) {
            el.classList.add('found');
        }
        
        // Применяем цвет из перемешанного набора
        if (gameState.isColored) {
            const color = gameState.levelColors[index % gameState.levelColors.length];
            el.style.backgroundColor = color;
            el.style.color = '#333'; // Темный текст для светлых фонов
        } else {
            el.style.backgroundColor = '#fff'; // Белый фон для нераскрашенных слов
            el.style.color = '#2c3e50';
        }
        
        const isFound = gameState.foundWords.includes(word);
        const isRevealed = gameState.revealedWords.includes(word);
        
        if (isFound || isRevealed) {
            el.textContent = word;
        } else {
            el.textContent = word.replace(/./g, '*');
        }
        
        container.appendChild(el);
    });
    
    document.getElementById('found-count').textContent = gameState.foundWords.length;
    document.getElementById('total-count').textContent = gameState.targetWords.length;

    // Update Hint Button State
    const hintBtn = document.getElementById('hint-btn');
    if (hintBtn) {
        const allWordsRevealedOrFound = gameState.targetWords.every(word => 
            gameState.foundWords.includes(word) || gameState.revealedWords.includes(word)
        );
        hintBtn.disabled = allWordsRevealedOrFound;
        if (allWordsRevealedOrFound) {
            hintBtn.classList.add('disabled');
        } else {
            hintBtn.classList.remove('disabled');
        }
    }

    // Update Bonus Button State
    const bonusBtn = document.getElementById('bonus-color-btn');
    if (bonusBtn) {
        const levelConfig = LEVELS_DATA[currentLevelIndex];
        const isInitiallyUncolored = levelConfig && levelConfig.difficulty && levelConfig.difficulty.colored === false;
        
        if (isInitiallyUncolored) {
            bonusBtn.classList.remove('hidden');
            if (gameState.isColored) {
                bonusBtn.disabled = true;
                bonusBtn.classList.add('disabled');
            } else {
                bonusBtn.disabled = false;
                bonusBtn.classList.remove('disabled');
            }
        } else {
            bonusBtn.classList.add('hidden');
        }
    }

    // Update Hidden Words UI
    const hiddenContainer = document.getElementById('hidden-words-container');
    const hiddenList = document.getElementById('hidden-words-list');
    
    if (gameState.hiddenWords.length > 0) {
        hiddenContainer.classList.remove('hidden');
        hiddenList.innerHTML = '';
        gameState.hiddenWords.forEach(word => {
            const el = document.createElement('div');
            el.className = 'hidden-word';
            el.textContent = word;
            hiddenList.appendChild(el);
        });
    } else {
        hiddenContainer.classList.add('hidden');
    }
}

function generateLevel(config) {
    generateLevelWithWords(config, gameState.targetWords);
}

function sortWordLetters(word, sortType) {
    const letters = word.split('');
    
    switch (sortType) {
        case LETTER_SORT.MIRROR:
            return letters.reverse();
            
        case LETTER_SORT.RANDOM:
            return shuffleArray([...letters]);
            
        case LETTER_SORT.KEEP_BASE:
            if (letters.length <= 3) return letters;
            const first = letters[0];
            const last = letters[letters.length - 1];
            const middle = letters.slice(1, -1);
            
            let shuffledMiddle;
            let attempts = 0;
            do {
                shuffledMiddle = shuffleArray([...middle]);
                attempts++;
            } while (shuffledMiddle.join('') === middle.join('') && attempts < 10);
            
            return [first, ...shuffledMiddle, last];
            
        case LETTER_SORT.DIRECT:
        default:
            return letters;
    }
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function renderBoard() {
    const board = document.getElementById('game-board');
    board.innerHTML = '';
    
    if (gameState.isProcessing) {
        board.classList.add('processing');
    } else {
        board.classList.remove('processing');
    }
    
    gameState.columns.forEach((col, colIndex) => {
        const colEl = document.createElement('div');
        colEl.className = 'column';
        colEl.dataset.colIndex = colIndex;
        
        col.forEach((tile, tileIndex) => {
            const tileEl = document.createElement('div');
            tileEl.className = 'tile';
            tileEl.textContent = tile.char;
            tileEl.dataset.colIndex = colIndex;
            tileEl.dataset.tileIndex = tileIndex;
            tileEl.id = tile.id;
            
        const status = getTileStatus(tile, colIndex, tileIndex);
        
        // Применяем цвет слова
        if (gameState.isColored && tile.wordIndex !== undefined && tile.wordIndex !== -1) {
            const color = gameState.levelColors[tile.wordIndex % gameState.levelColors.length];
            tileEl.style.backgroundColor = color;
        } else if (!gameState.isColored && status.active) {
            tileEl.style.backgroundColor = '#fff';
        } else {
            tileEl.style.backgroundColor = ''; // Сбрасываем инлайновый стиль, чтобы работал CSS
        }

        if (gameState.isProcessing) {
                tileEl.classList.add('blocked');
            } else if (status.selected) {
                tileEl.classList.add('selected');
                // Re-clicking selected tile removes it if it's the last one selected
                tileEl.onclick = () => handleSelectedTileClick(tile);
            } else if (status.active) {
                tileEl.classList.add('active');
                tileEl.onclick = () => handleTileClick(tile, colIndex, tileIndex);
            } else {
                tileEl.classList.add('blocked');
            }
            
            colEl.appendChild(tileEl);
        });
        
        board.appendChild(colEl);
    });
}

function getTileStatus(tile, colIndex, tileIndex) {
    // If already selected
    if (gameState.selectedTiles.some(t => t.id === tile.id)) {
        return { active: false, selected: true };
    }

    const column = gameState.columns[colIndex];
    
    // Bottom-Up Rule:
    // A tile is active if:
    // 1. It is the bottom-most UNSELECTED tile (index 0).
    // 2. OR the tile immediately below it (index - 1) is SELECTED.
    
    if (tileIndex === 0) return { active: true, selected: false };
    
    const tileBelow = column[tileIndex - 1];
    const isBelowSelected = gameState.selectedTiles.some(t => t.id === tileBelow.id);
    
    if (isBelowSelected) {
        return { active: true, selected: false };
    }
    
    return { active: false, selected: false };
}

function handleTileClick(tile, colIndex, tileIndex) {
    if (gameState.isProcessing) return;

    gameState.selectedTiles.push(tile);
    updateSelectionUI();
    renderBoard();
}

function updateSelectionUI() {
    const currentWord = gameState.selectedTiles.map(t => t.char).join('');
    const display = document.getElementById('current-word');
    const panel = document.getElementById('word-panel');
    const assembly = panel.parentElement;
    
    display.textContent = currentWord;
    
    // Сброс классов
    panel.className = 'current-word-display';
    assembly.className = 'word-assembly';
    
    if (currentWord.length === 0) {
        return; // Обычная белая панель, функций нет
    }
    
    // Определяем состояние слова
    const isTarget = gameState.targetWords.includes(currentWord);
    const isFoundTarget = gameState.foundWords.includes(currentWord);
    const isInDictionary = FULL_DICTIONARY.has(currentWord);
    const isFoundHidden = gameState.hiddenWords.includes(currentWord);
    
    if (isFoundTarget || isFoundHidden) {
        // 2.5 Если введенное слово уже найдено
        panel.classList.add('already-found');
        assembly.classList.add('already-found');
    } else if (isTarget) {
        // 2.3 Если введенное слово загадано, но еще не найдено
        panel.classList.add('correct', 'clickable');
        assembly.classList.add('correct');
    } else if (isInDictionary) {
        // 2.4 Если введенное слово не загадано, но есть в словаре
        panel.classList.add('gold', 'clickable');
        assembly.classList.add('gold');
    } else {
        // 2.2 Если буквы введены, но слово не найдено
        panel.classList.add('invalid', 'clickable');
        assembly.classList.add('invalid');
    }
}

function handleInputPanelClick() {
    if (gameState.isProcessing) return;
    
    const currentWord = gameState.selectedTiles.map(t => t.char).join('');
    if (currentWord.length === 0) return;
    
    const isTarget = gameState.targetWords.includes(currentWord);
    const isFoundTarget = gameState.foundWords.includes(currentWord);
    const isInDictionary = FULL_DICTIONARY.has(currentWord);
    const isFoundHidden = gameState.hiddenWords.includes(currentWord);
    
    if (isFoundTarget || isFoundHidden) {
        // Функции при нажатии нет
        return;
    } else if (isTarget || isInDictionary) {
        // Подтверждение
        checkWordMatch();
    } else {
        // СБРОС
        resetSelection();
    }
}

function useHint() {
    if (gameState.isProcessing) return;

    // Находим первое слово из targetWords, которое еще не открыто (нет в foundWords и revealedWords)
    const nextWord = gameState.targetWords.find(word => 
        !gameState.foundWords.includes(word) && !gameState.revealedWords.includes(word)
    );

    if (nextWord) {
        gameState.revealedWords.push(nextWord);
        updateTargetWordsUI();
    }
}

function activateBonusColor() {
    if (gameState.isProcessing || gameState.isColored) return;
    
    gameState.isColored = true;
    updateTargetWordsUI();
    renderBoard();
}

function checkWordMatch() {
    const currentWord = gameState.selectedTiles.map(t => t.char).join('');
    const display = document.getElementById('current-word');
    const panel = document.getElementById('word-panel');
    const infoMsg = document.getElementById('info-message');
    
    // 1. Проверка основных слов
    if (gameState.targetWords.includes(currentWord) && !gameState.foundWords.includes(currentWord)) {
        gameState.isProcessing = true;
        gameState.foundWords.push(currentWord);
        
        // Если слово было открыто подсказкой, удаляем его из revealedWords
        const revealedIndex = gameState.revealedWords.indexOf(currentWord);
        if (revealedIndex !== -1) {
            gameState.revealedWords.splice(revealedIndex, 1);
        }
        
        gameState.selectedTiles.forEach(tile => {
            const tileEl = document.getElementById(tile.id);
            if (tileEl) tileEl.classList.add('correct');
        });

        setTimeout(() => {
            removeSelectedTiles();
            
            gameState.selectedTiles = [];
            updateSelectionUI();
            updateTargetWordsUI();
            
            gameState.isProcessing = false;
            renderBoard();
            
            if (gameState.foundWords.length === gameState.targetWords.length) {
                setTimeout(() => {
                    document.getElementById('win-screen').classList.remove('hidden');
                }, 500);
            }
        }, 800);
    } 
    // 2. Проверка скрытых слов
    else if (FULL_DICTIONARY.has(currentWord) && !gameState.targetWords.includes(currentWord) && !gameState.hiddenWords.includes(currentWord)) {
        gameState.isProcessing = true;
        gameState.hiddenWords.push(currentWord);
        
        // Показываем инфо-надпись
        infoMsg.classList.remove('hidden');
        
        gameState.selectedTiles.forEach(tile => {
            const tileEl = document.getElementById(tile.id);
            if (tileEl) tileEl.classList.add('gold');
        });

        setTimeout(() => {
            infoMsg.classList.add('hidden');
            
            gameState.selectedTiles = [];
            updateSelectionUI();
            updateTargetWordsUI();
            
            gameState.isProcessing = false;
            renderBoard();
        }, 1200); // Чуть дольше для скрытых слов
    }
}

function removeSelectedTiles() {
    const tilesToRemoveIds = new Set(gameState.selectedTiles.map(t => t.id));
    
    gameState.columns.forEach(col => {
        for (let i = col.length - 1; i >= 0; i--) {
            if (tilesToRemoveIds.has(col[i].id)) {
                col.splice(i, 1);
            }
        }
    });
    
    renderBoard();
}

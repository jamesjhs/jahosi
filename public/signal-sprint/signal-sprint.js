/**
 * Signal Sprint — standalone edition, copied from TaskIt! Arcade.
 * Game ID: signal_sprint
 *
 * A friendly Morse-code listening game. Odd levels show visual dots/dashes
 * while playing audio; even levels are audio-only.
 *
 * Data and logic flow
 * -------------------
 * The page calls mount(), which shows a start screen. Pressing Start
 * resets level state, draws a randomized letter/word challenge, renders the UI,
 * and plays the Morse signal using Web Audio and timed visual highlights.
 *
 * The player types one character per answer box and submits. The answer checker
 * awards score bonuses or removes a life, then either advances the challenge,
 * advances the level after 15 survived challenges, or shows a summary screen
 * when all lives are lost. Each level-up increases the next level's life limit
 * by one, and the player can spend a spare life on a three-choice hint.
 *
 * Word and letter choices use shuffled bags so prompts arrive in a random order
 * without immediate repeats. Hints do not consume from those bags; they sample
 * decoy answers from the same-length source list and shuffle them with the truth.
 *
 * unmount() is the cleanup gate for the page: it stops pending timers, sound,
 * and references so the game can be reopened without duplicate state.
 */
(function () {
  'use strict';

  var MORSE = {
    A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.',
    G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..',
    M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.',
    S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-',
    Y: '-.--', Z: '--..',
  };

  var LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  var WORDS_BY_LENGTH = {
    2: [
      'OF', 'TO', 'IN', 'IS', 'ON', 'BY', 'IT', 'OR', 'BE', 'AT',
      'AS', 'AN', 'WE', 'US', 'IF', 'MY', 'DO', 'NO', 'HE', 'UP',
      'SO', 'GO', 'ME', 'AM', 'OK', 'OH', 'HI', 'AH', 'HA', 'HO',
      'OW', 'AW', 'EH', 'EX', 'AX', 'AD', 'ED', 'EM', 'EN', 'ER',
      'UM', 'UN', 'OP', 'LA', 'LO', 'MA', 'PA', 'YA', 'YO', 'YE'
    ],
    3: [
      'THE', 'AND', 'FOR', 'YOU', 'NOT', 'ARE', 'ALL', 'NEW', 'WAS', 'CAN',
      'HAS', 'BUT', 'OUR', 'ONE', 'MAY', 'OUT', 'USE', 'ANY', 'SEE', 'HIS',
      'WHO', 'WEB', 'NOW', 'GET', 'HOW', 'ITS', 'TOP', 'HAD', 'DAY', 'TWO',
      'BUY', 'HER', 'ADD', 'SHE', 'SET', 'MAP', 'WAY', 'OFF', 'DID', 'CAR',
      'OWN', 'END', 'HIM', 'PER', 'BIG', 'LAW', 'ART', 'OLD', 'NON', 'WHY',
      'LOW', 'MAN', 'JOB', 'TOO', 'MEN', 'BOX', 'AIR', 'YES', 'HOT', 'SAY',
      'TAX', 'GOT', 'LET', 'ACT', 'RED', 'KEY', 'FEW', 'AGE', 'PAY', 'FAX',
      'YET', 'RUN', 'NET', 'PUT', 'TRY', 'LOG', 'FUN', 'LOT', 'ASK', 'DUE',
      'PRO', 'AGO', 'VIA', 'BAD', 'FAR', 'OIL', 'BIT', 'BAY', 'BAR', 'DOG',
      'GAS', 'SIX', 'PRE', 'ZIP', 'BID', 'INN', 'WIN', 'BED', 'SEA', 'CUT',
      'KIT', 'BOY', 'SON', 'BIN', 'VAN', 'POP', 'HIT', 'EYE', 'ETC', 'FEE',
      'MIN', 'AID', 'FAT', 'SAW', 'SUB', 'LED', 'FAN', 'TEN', 'CAT', 'PET',
      'GUY', 'CUP', 'FIT', 'MET', 'ICE', 'BUS', 'BAG', 'NOR', 'BUG', 'MID',
      'LAB', 'DES', 'AVE', 'PIC', 'TAG', 'MIX', 'FIX', 'RAY', 'DRY', 'SPA',
      'CON', 'WON', 'MOM', 'ROW', 'EAT', 'AIM', 'TIP', 'SKI', 'FLY', 'HEY',
      'BBC', 'TEA', 'AVG', 'SKY', 'ROM', 'TOY', 'SRC', 'HIP', 'DOT', 'HIV',
      'PDA', 'DSL', 'ZUM', 'DNA', 'TIM', 'DON', 'ACC', 'CAP', 'INK', 'PIN',
      'RAW', 'GNU', 'BEN', 'AOL', 'HAT', 'LIB', 'UTC', 'DER', 'CAM', 'WET',
      'RAM', 'FOX', 'ARM', 'PUB', 'HOP', 'REF', 'KID', 'PAN', 'PSP', 'UND'
    ],
    4: [
      'THAT', 'THIS', 'WITH', 'FROM', 'YOUR', 'HAVE', 'MORE', 'WILL', 'HOME', 'PAGE',
      'FREE', 'TIME', 'THEY', 'SITE', 'WHAT', 'NEWS', 'ONLY', 'WHEN', 'HERE', 'ALSO',
      'HELP', 'VIEW', 'BEEN', 'WERE', 'SOME', 'LIKE', 'THAN', 'FIND', 'DATE', 'BACK',
      'LIST', 'NAME', 'JUST', 'OVER', 'YEAR', 'INTO', 'NEXT', 'USED', 'WORK', 'LAST',
      'MOST', 'DATA', 'MAKE', 'THEM', 'POST', 'CITY', 'SUCH', 'BEST', 'THEN', 'GOOD',
      'WELL', 'INFO', 'HIGH', 'EACH', 'VERY', 'BOOK', 'READ', 'NEED', 'MANY', 'USER',
      'SAID', 'DOES', 'MAIL', 'FULL', 'LIFE', 'KNOW', 'DAYS', 'PART', 'REAL', 'ITEM',
      'EBAY', 'MUST', 'MADE', 'LINE', 'SEND', 'TYPE', 'TAKE', 'AREA', 'WANT', 'LONG',
      'CODE', 'SHOW', 'EVEN', 'MUCH', 'SIGN', 'FILE', 'LINK', 'OPEN', 'CASE', 'SAME',
      'BOTH', 'GAME', 'CARE', 'DOWN', 'SIZE', 'SHOP', 'TEXT', 'RATE', 'FORM', 'LOVE',
      'MAIN', 'CALL', 'SAVE', 'YORK', 'CARD', 'JOBS', 'FOOD', 'SALE', 'TEEN', 'ROOM',
      'JOIN', 'WEST', 'LOOK', 'LEFT', 'TEAM', 'WEEK', 'NOTE', 'LIVE', 'JUNE', 'PLAN',
      'COST', 'JULY', 'TEST', 'COME', 'CART', 'PLAY', 'LESS', 'PARK', 'SIDE', 'GIVE',
      'SELL', 'BODY', 'EAST', 'CLUB', 'ROAD', 'GIFT', 'HARD', 'FOUR', 'BLUE', 'EASY',
      'STAR', 'HAND', 'KEEP', 'BABY', 'TERM', 'FILM', 'HEAD', 'CELL', 'SELF', 'AWAY',
      'ONCE', 'SURE', 'CARS', 'TELL', 'ABLE', 'GOLD', 'ARTS', 'PAST', 'FIVE', 'UPON',
      'SAYS', 'LAND', 'DONE', 'EVER', 'WORD', 'BILL', 'TALK', 'KIDS', 'TRUE', 'ELSE',
      'ROCK', 'TIPS', 'PLUS', 'AUTO', 'EDIT', 'FAST', 'FACT', 'UNIT', 'TECH', 'MEET',
      'FEEL', 'BANK', 'RISK', 'TOWN', 'GIRL', 'TOYS', 'GOLF', 'LOAN', 'WIDE', 'SORT',
      'HALF', 'STEP', 'NONE', 'LAKE', 'SONY', 'FIRE', 'CHAT', 'LOSS', 'FACE', 'BASE',
      'NEAR', 'STAY', 'TURN', 'MEAN', 'KING', 'COPY', 'DRUG', 'PICS', 'CASH', 'SEEN',
      'PORT', 'STOP', 'SOON', 'HELD', 'MIND', 'LOST', 'TOUR', 'MENU', 'HOPE', 'WISH',
      'ROLE', 'CAME', 'FINE', 'HOUR', 'BUSH', 'HUGE', 'KIND', 'MOVE', 'LOGO', 'NICE'
    ],
    5: [
      'ABOUT', 'OTHER', 'WHICH', 'THEIR', 'THERE', 'FIRST', 'WOULD', 'THESE', 'CLICK', 'PRICE',
      'STATE', 'EMAIL', 'WORLD', 'MUSIC', 'AFTER', 'VIDEO', 'WHERE', 'BOOKS', 'LINKS', 'YEARS',
      'ORDER', 'ITEMS', 'GROUP', 'UNDER', 'GAMES', 'COULD', 'GREAT', 'HOTEL', 'STORE', 'TERMS',
      'RIGHT', 'LOCAL', 'THOSE', 'USING', 'PHONE', 'FORUM', 'BASED', 'BLACK', 'CHECK', 'INDEX',
      'BEING', 'WOMEN', 'TODAY', 'SOUTH', 'PAGES', 'FOUND', 'HOUSE', 'PHOTO', 'POWER', 'WHILE',
      'THREE', 'TOTAL', 'PLACE', 'THINK', 'NORTH', 'POSTS', 'MEDIA', 'WATER', 'SINCE', 'GUIDE',
      'BOARD', 'WHITE', 'SMALL', 'TIMES', 'SITES', 'LEVEL', 'HOURS', 'IMAGE', 'TITLE', 'SHALL',
      'CLASS', 'STILL', 'MONEY', 'EVERY', 'VISIT', 'TOOLS', 'REPLY', 'VALUE', 'PRESS', 'LEARN',
      'PRINT', 'STOCK', 'POINT', 'SALES', 'LARGE', 'TABLE', 'START', 'MODEL', 'HUMAN', 'MOVIE',
      'MARCH', 'GOING', 'STUDY', 'STAFF', 'AGAIN', 'APRIL', 'NEVER', 'USERS', 'TOPIC', 'BELOW',
      'PARTY', 'LEGAL', 'ABOVE', 'QUOTE', 'STORY', 'RATES', 'YOUNG', 'FIELD', 'PAPER', 'GIRLS',
      'NIGHT', 'POKER', 'ISSUE', 'RANGE', 'COURT', 'AUDIO', 'LIGHT', 'WRITE', 'OFFER', 'GIVEN',
      'FILES', 'EVENT', 'NEEDS', 'MIGHT', 'MONTH', 'MAJOR', 'AREAS', 'SPACE', 'CARDS', 'CHILD',
      'ENTER', 'SHARE', 'ADDED', 'RADIO', 'UNTIL', 'COLOR', 'TRACK', 'LEAST', 'TRADE', 'GREEN',
      'CLOSE', 'DRIVE', 'SHORT', 'MEANS', 'DAILY', 'BEACH', 'COSTS', 'STYLE', 'FRONT', 'PARTS',
      'EARLY', 'MILES', 'SOUND', 'WORKS', 'RULES', 'FINAL', 'THING', 'CHEAP', 'THIRD', 'GIFTS',
      'COVER', 'OFTEN', 'WATCH', 'DEALS', 'WORDS', 'LINUX', 'HEART', 'ERROR', 'CLEAR', 'MAKES',
      'INDIA', 'TAKEN', 'KNOWN', 'CASES', 'QUICK', 'WHOLE', 'LATER', 'BASIC', 'SHOWS', 'ALONG',
      'AMONG', 'DEATH', 'SPEED', 'BRAND', 'STUFF', 'JAPAN', 'DOING', 'LOANS', 'SHOES', 'ENTRY',
      'NOTES', 'FORCE', 'RIVER', 'ALBUM', 'VIEWS', 'PLANS', 'BUILD', 'TYPES', 'LINES', 'APPLY',
      'ASKED', 'CROSS', 'WEEKS', 'LOWER', 'UNION', 'NAMES', 'LEAVE', 'TEENS', 'WOMAN', 'CABLE'
    ],
    6: [
      'SEARCH', 'ONLINE', 'PEOPLE', 'HEALTH', 'SHOULD', 'SYSTEM', 'POLICY', 'NUMBER', 'PLEASE', 'RIGHTS',
      'PUBLIC', 'SCHOOL', 'REVIEW', 'UNITED', 'CENTER', 'TRAVEL', 'REPORT', 'MEMBER', 'BEFORE', 'HOTELS',
      'OFFICE', 'DESIGN', 'POSTED', 'WITHIN', 'STATES', 'FAMILY', 'PRICES', 'SPORTS', 'COUNTY', 'ACCESS',
      'CHANGE', 'RATING', 'DURING', 'RETURN', 'EVENTS', 'LITTLE', 'MOVIES', 'SOURCE', 'AUTHOR', 'AROUND',
      'COURSE', 'CANADA', 'CREDIT', 'ESTATE', 'SELECT', 'PHOTOS', 'THREAD', 'MARKET', 'REALLY', 'ACTION',
      'SERIES', 'SECOND', 'FORUMS', 'BETTER', 'FRIEND', 'SERVER', 'ISSUES', 'STREET', 'THINGS', 'PERSON',
      'MOBILE', 'OFFERS', 'RECENT', 'STORES', 'MEMORY', 'SOCIAL', 'AUGUST', 'CREATE', 'SINGLE', 'LATEST',
      'STATUS', 'BROWSE', 'SELLER', 'ALWAYS', 'RESULT', 'GROUPS', 'MAKING', 'FUTURE', 'LONDON', 'BECOME',
      'GARDEN', 'LISTED', 'ENERGY', 'IMAGES', 'NOTICE', 'OTHERS', 'FORMAT', 'MONTHS', 'SAFETY', 'HAVING',
      'COMMON', 'LIVING', 'CALLED', 'PERIOD', 'WINDOW', 'FRANCE', 'REGION', 'ISLAND', 'RECORD', 'DIRECT',
      'UPDATE', 'EITHER', 'CENTRE', 'EUROPE', 'TOPICS', 'VIDEOS', 'GLOBAL', 'PLAYER', 'LYRICS', 'SUBMIT',
      'AMOUNT', 'THOUGH', 'THANKS', 'WEIGHT', 'CHOOSE', 'POINTS', 'CAMERA', 'DOMAIN', 'BEAUTY', 'MODELS',
      'SIMPLE', 'FRIDAY', 'ANNUAL', 'CHURCH', 'METHOD', 'ACTIVE', 'FIGURE', 'ENOUGH', 'HIGHER', 'YELLOW',
      'FRENCH', 'NATURE', 'ORDERS', 'AFRICA', 'GROWTH', 'AGENCY', 'MONDAY', 'INCOME', 'ENGINE', 'DOUBLE',
      'SCREEN', 'ACROSS', 'NEEDED', 'SEASON', 'EFFECT', 'SUNDAY', 'CASINO', 'VOLUME', 'ANYONE', 'SILVER',
      'INSIDE', 'MATURE', 'RATHER', 'SUPPLY', 'ROBERT', 'SKILLS', 'ADVICE', 'CAREER', 'RENTAL', 'MIDDLE',
      'TAKING', 'VALUES', 'COMING', 'OBJECT', 'LENGTH', 'CLIENT', 'FOLLOW', 'SAMPLE', 'CHOICE', 'ARTIST',
      'LEVELS', 'LETTER', 'PHONES', 'SUMMER', 'DEGREE', 'BUTTON', 'MATTER', 'CUSTOM', 'ALMOST', 'EDITOR'
    ],
    7: [
      'CONTACT', 'SERVICE', 'PRODUCT', 'SUPPORT', 'MESSAGE', 'THROUGH', 'PRIVACY', 'COMPANY', 'GENERAL', 'JANUARY',
      'REVIEWS', 'PROGRAM', 'DETAILS', 'BECAUSE', 'RESULTS', 'ADDRESS', 'SUBJECT', 'BETWEEN', 'SPECIAL', 'WEBSITE',
      'PROJECT', 'VERSION', 'SECTION', 'RELATED', 'MEMBERS', 'NETWORK', 'SYSTEMS', 'WITHOUT', 'CURRENT', 'CONTROL',
      'HISTORY', 'ACCOUNT', 'DIGITAL', 'PROFILE', 'ANOTHER', 'QUALITY', 'LISTING', 'CONTENT', 'COUNTRY', 'PRIVATE',
      'COMPARE', 'INCLUDE', 'COLLEGE', 'ARTICLE', 'PROVIDE', 'PROCESS', 'SCIENCE', 'ENGLISH', 'WINDOWS', 'GALLERY',
      'HOWEVER', 'OCTOBER', 'LIBRARY', 'MEDICAL', 'LOOKING', 'COMMENT', 'WORKING', 'AGAINST', 'PAYMENT', 'STUDENT',
      'PROBLEM', 'OPTIONS', 'AMERICA', 'EXAMPLE', 'CHANGES', 'RELEASE', 'REQUEST', 'PICTURE', 'MEETING', 'SIMILAR',
      'SCHOOLS', 'MILLION', 'POPULAR', 'STORIES', 'JOURNAL', 'REPORTS', 'WELCOME', 'CENTRAL', 'COUNCIL', 'ARCHIVE',
      'SOCIETY', 'FRIENDS', 'EDITION', 'FURTHER', 'UPDATED', 'ALREADY', 'STUDIES', 'SEVERAL', 'DISPLAY', 'LIMITED',
      'POWERED', 'NATURAL', 'WHETHER', 'WEATHER', 'AVERAGE', 'RECORDS', 'PRESENT', 'WRITTEN', 'FEDERAL', 'HOSTING',
      'TICKETS', 'FINANCE', 'MINUTES', 'READING', 'USUALLY', 'PERCENT', 'GETTING', 'GERMANY', 'VARIOUS', 'RECEIVE',
      'METHODS', 'CHAPTER', 'MANAGER', 'MICHAEL', 'FLORIDA', 'LICENSE', 'HOLIDAY', 'WRITING', 'EFFECTS', 'CREATED',
      'KINGDOM', 'THOUGHT', 'STORAGE', 'SUMMARY', 'WESTERN', 'OVERALL', 'PACKAGE', 'PLAYERS', 'STARTED', 'SOMEONE'
    ],
    8: [
      'BUSINESS', 'SERVICES', 'PRODUCTS', 'SOFTWARE', 'RESEARCH', 'COMMENTS', 'NATIONAL', 'INTERNET', 'SHIPPING', 'RESERVED',
      'SECURITY', 'AMERICAN', 'COMPUTER', 'DOWNLOAD', 'PICTURES', 'PERSONAL', 'LOCATION', 'CHILDREN', 'STUDENTS', 'SHOPPING',
      'PREVIOUS', 'PROPERTY', 'CUSTOMER', 'DECEMBER', 'TRAINING', 'ADVANCED', 'CATEGORY', 'REGISTER', 'NOVEMBER', 'FEATURES',
      'INDUSTRY', 'PROVIDED', 'REQUIRED', 'ARTICLES', 'FEEDBACK', 'COMPLETE', 'STANDARD', 'PROGRAMS', 'LANGUAGE', 'PASSWORD',
      'QUESTION', 'BUILDING', 'FEBRUARY', 'ANALYSIS', 'POSSIBLE', 'PROBLEMS', 'INTEREST', 'LEARNING', 'DELIVERY', 'ORIGINAL',
      'INCLUDES', 'MESSAGES', 'PROVIDES', 'SPECIFIC', 'DIRECTOR', 'PLANNING', 'DATABASE', 'OFFICIAL', 'DISTRICT', 'CALENDAR',
      'RESOURCE', 'DOCUMENT', 'MATERIAL', 'TOGETHER', 'FUNCTION', 'ECONOMIC', 'PROJECTS', 'INCLUDED', 'RECEIVED', 'ARCHIVES',
      'MAGAZINE', 'POLICIES', 'POSITION', 'LISTINGS', 'WIRELESS', 'PURCHASE', 'RESPONSE', 'PRACTICE', 'HARDWARE', 'DESIGNED',
      'DISCOUNT', 'REMEMBER', 'INCREASE', 'EUROPEAN', 'ACTIVITY', 'ALTHOUGH', 'CONTENTS', 'REGIONAL', 'SUPPLIES', 'EXCHANGE',
      'CONTINUE', 'BENEFITS', 'ANYTHING', 'MORTGAGE', 'SOLUTION', 'ADDITION', 'CLOTHING', 'HOMEPAGE', 'MILITARY', 'DECISION',
      'DIVISION', 'ACTUALLY', 'SATURDAY', 'STARTING', 'THURSDAY', 'CONSUMER', 'CONTRACT', 'RELEASES', 'VIRGINIA', 'MULTIPLE',
      'FEATURED', 'FRIENDLY', 'SCHEDULE', 'EVERYONE', 'APPROACH', 'PHYSICAL', 'MEDICINE', 'EVIDENCE', 'FAVORITE', 'RECENTLY'
    ]
  };

  var CHALLENGES_PER_LEVEL = 15;
  var LIVES_PER_LEVEL = 3;
  var REPLAYS_PER_CHALLENGE = 2;
  var MAX_WORD_LENGTH = 8;
  var TONE_FREQUENCY = 640;

  var active = false;
  var frameEl = null;
  var audioContext = null;
  var masterGain = null;
  var timers = [];
  var oscillatorStops = [];
  var letterBag = [];
  var wordBags = {};

  var level = 1;
  var challenge = 1;
  var lives = LIVES_PER_LEVEL;
  var maxLives = LIVES_PER_LEVEL;
  var score = 0;
  var streak = 0;
  var totalCorrect = 0;
  var totalWrong = 0;
  var bestLevel = 1;
  var currentAnswer = '';
  var currentMorse = [];
  var replaysLeft = REPLAYS_PER_CHALLENGE;
  var playing = false;
  var started = false;
  var resultMode = false;
  var hintUsed = false;
  var hintOptions = [];

  /**
   * Stop any scheduled Morse playback work and any tones that are currently
   * waiting to stop. This keeps sounds and highlights from leaking into the next
   * challenge or after the arcade overlay closes.
   */
  function clearTimers() {
    timers.forEach(function (id) { clearTimeout(id); });
    timers = [];
    oscillatorStops.forEach(function (stop) { stop(); });
    oscillatorStops = [];
    playing = false;
  }

  /**
   * Fully shut down the game's audio system. The page calls this through
   * unmount(), and the game also uses it before restarting a session.
   */
  function stopAudio() {
    clearTimers();
    if (audioContext) {
      audioContext.close().catch(function () {});
      audioContext = null;
      masterGain = null;
    }
  }

  /**
   * Create or resume the browser audio context after the user has pressed Start.
   * Browsers block autoplay, so all sound begins from that user action.
   */
  function ensureAudio() {
    if (!audioContext) {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      audioContext = new Ctx();
      masterGain = audioContext.createGain();
      masterGain.gain.value = 0.09;
      masterGain.connect(audioContext.destination);
    }
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(function () {});
    }
    return audioContext;
  }

  /**
   * Convert the current level into the answer length. Level 1 is letters, level
   * 2 is two-letter words, and higher levels grow up to the maximum word length.
   */
  function levelLength() {
    return Math.min(level, MAX_WORD_LENGTH);
  }

  /**
   * Decide whether this level hides the visual Morse display. Even-numbered
   * levels are audio-only, which makes every other level a listening challenge.
   */
  function isAudioOnlyLevel() {
    return level % 2 === 0;
  }

  /**
   * Calculate the Morse timing unit for the current point in the game. The unit
   * shrinks both by level and within a level, making signals steadily faster.
   */
  function speedUnit() {
    var intraLevelRamp = Math.floor((challenge - 1) / 3) * 4;
    return Math.max(58, 170 - (level - 1) * 11 - intraLevelRamp);
  }

  /**
   * Return a shuffled copy of a list without changing the original data. This is
   * used for random prompt order while keeping the source word banks stable.
   */
  function shuffledCopy(list) {
    var copy = list.slice();
    for (var i = copy.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var temp = copy[i];
      copy[i] = copy[j];
      copy[j] = temp;
    }
    return copy;
  }

  /**
   * Draw the next randomized letter from the letter bag. When the bag empties,
   * it refills with a newly shuffled alphabet.
   */
  function drawLetter() {
    if (!letterBag.length) {
      letterBag = shuffledCopy(LETTERS);
    }
    return letterBag.pop();
  }

  /**
   * Draw the next randomized word of the requested length. Each word length has
   * its own shuffled bag, so repeated lengths do not repeat until the bag resets.
   */
  function drawWord(len) {
    var pool = WORDS_BY_LENGTH[len] || WORDS_BY_LENGTH[MAX_WORD_LENGTH];
    if (!wordBags[len] || !wordBags[len].length) {
      wordBags[len] = shuffledCopy(pool);
    }
    return wordBags[len].pop();
  }

  /**
   * Pick two plausible wrong answers that match the current answer length. These
   * are used only for hints and do not remove words from the normal challenge bags.
   */
  function decoyAnswers() {
    var len = levelLength();
    var pool = len === 1 ? LETTERS : (WORDS_BY_LENGTH[len] || WORDS_BY_LENGTH[MAX_WORD_LENGTH]);
    var options = shuffledCopy(pool).filter(function (item) { return item !== currentAnswer; });
    return options.slice(0, 2);
  }

  /**
   * Clear the randomized letter and word queues. A fresh game starts with fresh
   * shuffle order rather than continuing the previous session's remaining bag.
   */
  function resetBags() {
    letterBag = [];
    wordBags = {};
  }

  /**
   * Pick the next answer and translate it into Morse data for rendering and
   * playback. This also resets replay count and answer-result state.
   */
  function pickChallenge() {
    var len = levelLength();
    if (len === 1) {
      currentAnswer = drawLetter();
    } else {
      currentAnswer = drawWord(len);
    }
    currentMorse = currentAnswer.split('').map(function (letter) {
      return { letter: letter, code: MORSE[letter] };
    });
    replaysLeft = REPLAYS_PER_CHALLENGE;
    resultMode = false;
    hintUsed = false;
    hintOptions = [];
  }

  /**
   * Reset the full run back to level 1 with fresh lives, score, streaks, and
   * randomized prompt bags. This is used at the start and after Try Again.
   */
  function resetGame() {
    level = 1;
    challenge = 1;
    lives = LIVES_PER_LEVEL;
    maxLives = LIVES_PER_LEVEL;
    score = 0;
    streak = 0;
    totalCorrect = 0;
    totalWrong = 0;
    bestLevel = 1;
    resetBags();
    pickChallenge();
  }

  /**
   * Return all Signal Sprint styles as scoped CSS under the ss- class prefix.
   * Keeping styles inside the game file makes the standalone module portable.
   */
  function css() {
    return [
      '.ss-root{--ss-ink:#1f2937;--ss-soft:#f8fafc;--ss-line:#d9e2ef;--ss-primary:#4f46e5;--ss-primary-dark:#3730a3;--ss-good:#15803d;--ss-bad:#dc2626;--ss-warn:#b45309;box-sizing:border-box;width:100%;min-height:100%;display:flex;flex-direction:column;gap:12px;padding:14px;color:var(--ss-ink);font-family:inherit;background:linear-gradient(180deg,#ffffff 0%,#f8fafc 100%);}',
      '.ss-root *{box-sizing:border-box;}',
      '.ss-hud{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;}',
      '.ss-stat{border:1px solid var(--ss-line);background:#fff;border-radius:8px;padding:8px 10px;min-width:0;}',
      '.ss-stat b{display:block;font-size:1rem;line-height:1.1;color:#111827;}',
      '.ss-stat span{display:block;font-size:.72rem;color:#64748b;text-transform:uppercase;letter-spacing:.04em;margin-top:2px;}',
      '.ss-main{flex:1;display:grid;grid-template-columns:minmax(0,1.1fr) minmax(250px,.9fr);gap:12px;min-height:0;}',
      '.ss-panel{border:1px solid var(--ss-line);background:#fff;border-radius:8px;padding:14px;display:flex;flex-direction:column;gap:12px;min-width:0;}',
      '.ss-signal{align-items:center;justify-content:center;text-align:center;position:relative;overflow:hidden;}',
      '.ss-level-tag{font-size:.78rem;font-weight:700;color:var(--ss-primary-dark);text-transform:uppercase;letter-spacing:.06em;}',
      '.ss-prompt{font-size:clamp(1rem,2.4vw,1.35rem);font-weight:800;margin:0;color:#111827;}',
      '.ss-morse{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px;min-height:78px;width:100%;}',
      '.ss-letter{display:flex;align-items:center;gap:5px;padding:7px 8px;border-radius:8px;background:#f1f5f9;border:1px solid #dbe4f0;}',
      '.ss-symbol{width:18px;height:18px;border-radius:999px;background:#94a3b8;transform:scale(.82);transition:transform .08s ease,background .08s ease;}',
      '.ss-symbol--dash{width:34px;border-radius:999px;}',
      '.ss-symbol--active{background:var(--ss-primary);transform:scale(1.12);box-shadow:0 0 0 4px rgba(79,70,229,.13);}',
      '.ss-hidden-signal{display:flex;align-items:center;justify-content:center;min-height:78px;width:100%;border:1px dashed #cbd5e1;border-radius:8px;background:#f8fafc;color:#475569;font-weight:800;}',
      '.ss-answer{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;}',
      '.ss-box{width:42px;height:48px;border:2px solid #cbd5e1;border-radius:8px;text-align:center;font-size:1.35rem;font-weight:900;text-transform:uppercase;color:#111827;background:#fff;caret-color:var(--ss-primary);}',
      '.ss-box:focus{outline:none;border-color:var(--ss-primary);box-shadow:0 0 0 3px rgba(79,70,229,.16);}',
      '.ss-controls{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px;}',
      '.ss-hint-options{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px;min-height:40px;}',
      '.ss-choice{border:1px solid #c7d2fe;border-radius:8px;background:#eef2ff;color:#312e81;font-weight:900;padding:8px 12px;min-height:38px;min-width:58px;cursor:pointer;font-family:inherit;}',
      '.ss-choice:hover{background:#dbe4ff;border-color:#818cf8;}',
      '.ss-btn{border:0;border-radius:8px;background:var(--ss-primary);color:#fff;font-weight:800;padding:9px 12px;min-height:40px;cursor:pointer;font-family:inherit;}',
      '.ss-btn:hover{background:var(--ss-primary-dark);}',
      '.ss-btn:disabled{opacity:.45;cursor:not-allowed;}',
      '.ss-btn--light{background:#e0e7ff;color:#312e81;}',
      '.ss-btn--light:hover{background:#c7d2fe;}',
      '.ss-btn--good{background:var(--ss-good);}',
      '.ss-meta{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;font-size:.78rem;color:#475569;}',
      '.ss-pill{border-radius:999px;background:#eef2ff;color:#3730a3;padding:4px 8px;font-weight:800;}',
      '.ss-message{min-height:44px;margin:0;text-align:center;font-weight:800;color:#334155;}',
      '.ss-message--good{color:var(--ss-good);}',
      '.ss-message--bad{color:var(--ss-bad);}',
      '.ss-side{justify-content:space-between;}',
      '.ss-side h3{font-size:1rem;margin:0;color:#111827;}',
      '.ss-score-list{display:grid;gap:7px;font-size:.9rem;color:#334155;}',
      '.ss-score-row{display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid #edf2f7;padding-bottom:6px;}',
      '.ss-start,.ss-summary{margin:auto;max-width:560px;text-align:center;align-items:center;}',
      '.ss-start h2,.ss-summary h2{font-size:clamp(1.4rem,4vw,2rem);margin:0;color:#111827;}',
      '.ss-start p,.ss-summary p{margin:0;color:#475569;line-height:1.45;}',
      '@media (max-width:720px){.ss-root{padding:10px;}.ss-hud{grid-template-columns:repeat(2,minmax(0,1fr));}.ss-main{grid-template-columns:1fr;}.ss-side{display:none;}.ss-box{width:38px;height:44px;font-size:1.18rem;}.ss-panel{padding:11px;}}',
    ].join('');
  }

  /**
   * Rebuild the game frame from the current state. The function chooses between
   * the start screen and active game UI, then restores input focus for play.
   */
  function render() {
    if (!frameEl) return;
    frameEl.innerHTML = '';

    var root = document.createElement('div');
    root.className = 'ss-root';

    var style = document.createElement('style');
    style.textContent = css();
    root.appendChild(style);

    if (!started) {
      renderStart(root);
    } else {
      renderGame(root);
    }

    frameEl.appendChild(root);
    if (started && !resultMode) focusFirstBox();
  }

  /**
   * Build the first screen shown before audio is allowed to play. The Start
   * button is the user gesture that unlocks browser audio playback.
   */
  function renderStart(root) {
    var panel = document.createElement('div');
    panel.className = 'ss-panel ss-start';

    var title = document.createElement('h2');
    title.textContent = 'Signal Sprint';

    var copy = document.createElement('p');
    copy.textContent = 'Decode quick Morse signals. Some levels show the dots and dashes, and every other level asks you to trust your ears.';

    var start = document.createElement('button');
    start.className = 'ss-btn ss-btn--good';
    start.textContent = 'Start Signal Sprint';
    start.addEventListener('click', function () {
      started = true;
      resetGame();
      ensureAudio();
      render();
      playCurrentSignal(false);
    });

    panel.appendChild(title);
    panel.appendChild(copy);
    panel.appendChild(start);
    root.appendChild(panel);
  }

  /**
   * Build the main play screen: HUD, signal area, answer boxes, controls, and
   * the scoring side panel. It reads current state rather than owning game logic.
   */
  function renderGame(root) {
    root.appendChild(buildHud());

    var main = document.createElement('div');
    main.className = 'ss-main';

    var signalPanel = document.createElement('div');
    signalPanel.className = 'ss-panel ss-signal';

    var tag = document.createElement('div');
    tag.className = 'ss-level-tag';
    tag.textContent = 'Level ' + level + ' - ' + levelName();

    var prompt = document.createElement('p');
    prompt.className = 'ss-prompt';
    prompt.textContent = isAudioOnlyLevel() ? 'Listen, then type what you heard' : 'Watch and listen, then type the signal';

    signalPanel.appendChild(tag);
    signalPanel.appendChild(prompt);
    signalPanel.appendChild(buildSignalDisplay());
    signalPanel.appendChild(buildAnswerBoxes());
    signalPanel.appendChild(buildControls());
    signalPanel.appendChild(buildHintOptions());

    var message = document.createElement('p');
    message.id = 'ss-message';
    message.className = 'ss-message';
    signalPanel.appendChild(message);

    main.appendChild(signalPanel);
    main.appendChild(buildSidePanel());
    root.appendChild(main);
  }

  /**
   * Create the compact top row showing level, challenge count, lives, and score.
   * It is rebuilt whenever these values change.
   */
  function buildHud() {
    var hud = document.createElement('div');
    hud.className = 'ss-hud';
    addStat(hud, level, 'Level');
    addStat(hud, challenge + ' / ' + CHALLENGES_PER_LEVEL, 'Challenge');
    addStat(hud, lives + ' / ' + maxLives, 'Lives');
    addStat(hud, score, 'Score');
    return hud;
  }

  /**
   * Add one labelled value to the HUD. This small helper keeps the HUD markup
   * consistent across all four stats.
   */
  function addStat(parent, value, label) {
    var stat = document.createElement('div');
    stat.className = 'ss-stat';
    var b = document.createElement('b');
    b.textContent = value;
    var span = document.createElement('span');
    span.textContent = label;
    stat.appendChild(b);
    stat.appendChild(span);
    parent.appendChild(stat);
  }

  /**
   * Build either the visual Morse dots/dashes or the audio-only placeholder.
   * On visual levels, each symbol gets a stable id so playback can highlight it.
   */
  function buildSignalDisplay() {
    if (isAudioOnlyLevel()) {
      var hidden = document.createElement('div');
      hidden.className = 'ss-hidden-signal';
      hidden.textContent = 'Audio-only signal';
      return hidden;
    }

    var wrap = document.createElement('div');
    wrap.className = 'ss-morse';
    currentMorse.forEach(function (item, letterIndex) {
      var letter = document.createElement('div');
      letter.className = 'ss-letter';
      item.code.split('').forEach(function (symbol, symbolIndex) {
        var dot = document.createElement('span');
        dot.className = 'ss-symbol' + (symbol === '-' ? ' ss-symbol--dash' : '');
        dot.id = 'ss-symbol-' + letterIndex + '-' + symbolIndex;
        dot.setAttribute('aria-label', symbol === '-' ? 'dash' : 'dot');
        letter.appendChild(dot);
      });
      wrap.appendChild(letter);
    });
    return wrap;
  }

  /**
   * Create one input box for each expected answer character. The boxes support
   * touch keyboards, physical keyboards, paste, and automatic focus movement.
   */
  function buildAnswerBoxes() {
    var wrap = document.createElement('div');
    wrap.className = 'ss-answer';
    for (var i = 0; i < currentAnswer.length; i++) {
      var input = document.createElement('input');
      input.className = 'ss-box';
      input.id = 'ss-box-' + i;
      input.type = 'text';
      input.inputMode = 'text';
      input.autocomplete = 'off';
      input.autocapitalize = 'characters';
      input.spellcheck = false;
      input.maxLength = 1;
      input.disabled = resultMode;
      input.setAttribute('aria-label', 'Answer letter ' + (i + 1));
      (function (idx) {
        input.addEventListener('input', function (event) { handleBoxInput(event, idx); });
        input.addEventListener('keydown', function (event) { handleBoxKey(event, idx); });
        input.addEventListener('paste', handlePaste);
      }(i));
      wrap.appendChild(input);
    }
    return wrap;
  }

  /**
   * Build the replay, submit, and hint controls for an active challenge. Replay
   * and hint availability follow their current limits and disabled states.
   */
  function buildControls() {
    var wrap = document.createElement('div');
    wrap.className = 'ss-controls';

    var replay = document.createElement('button');
    replay.className = 'ss-btn ss-btn--light';
    replay.textContent = 'Replay (' + replaysLeft + ')';
    replay.disabled = resultMode || playing || replaysLeft <= 0;
    replay.addEventListener('click', function () {
      if (replaysLeft <= 0) return;
      replaysLeft--;
      updateControls();
      playCurrentSignal(false);
    });

    var submit = document.createElement('button');
    submit.id = 'ss-submit';
    submit.className = 'ss-btn';
    submit.textContent = 'Submit';
    submit.disabled = resultMode;
    submit.addEventListener('click', submitAnswer);

    var hint = document.createElement('button');
    hint.className = 'ss-btn ss-btn--light';
    hint.textContent = 'Hint (-1 life)';
    hint.disabled = resultMode || playing || hintUsed || lives <= 1;
    hint.addEventListener('click', buyHint);

    wrap.appendChild(replay);
    wrap.appendChild(submit);
    wrap.appendChild(hint);
    return wrap;
  }

  /**
   * Build the three multiple-choice hint answers after a hint is bought. The
   * choices are hidden until the player spends a life on the Hint button.
   */
  function buildHintOptions() {
    var wrap = document.createElement('div');
    wrap.className = 'ss-hint-options';
    if (!hintOptions.length || resultMode) return wrap;

    hintOptions.forEach(function (answer) {
      var choice = document.createElement('button');
      choice.className = 'ss-choice';
      choice.textContent = answer;
      choice.addEventListener('click', function () {
        chooseHintAnswer(answer);
      });
      wrap.appendChild(choice);
    });

    return wrap;
  }

  /**
   * Build the desktop scoring/reference panel. It summarizes how points are
   * earned without affecting the actual scoring logic.
   */
  function buildSidePanel() {
    var side = document.createElement('div');
    side.className = 'ss-panel ss-side';

    var top = document.createElement('div');
    var h = document.createElement('h3');
    h.textContent = 'Sprint scoring';
    top.appendChild(h);

    var list = document.createElement('div');
    list.className = 'ss-score-list';
    addScoreRow(list, 'Correct answer', 'length + level');
    addScoreRow(list, 'Unused replays', 'bonus');
    addScoreRow(list, 'Speed', speedUnit() + ' ms unit');
    addScoreRow(list, 'Streak', streak + ' correct');
    addScoreRow(list, 'Level clear', 'life bonus');
    top.appendChild(list);

    var meta = document.createElement('div');
    meta.className = 'ss-meta';
    addPill(meta, isAudioOnlyLevel() ? 'Audio only' : 'Visual + audio');
    addPill(meta, 'Enter submits');
    addPill(meta, '2 replays');
    addPill(meta, 'Hints cost 1 life');

    side.appendChild(top);
    side.appendChild(meta);
    return side;
  }

  /**
   * Add a single row to the scoring explanation panel. This keeps labels and
   * current values aligned in a predictable format.
   */
  function addScoreRow(parent, label, value) {
    var row = document.createElement('div');
    row.className = 'ss-score-row';
    var l = document.createElement('span');
    l.textContent = label;
    var v = document.createElement('strong');
    v.textContent = value;
    row.appendChild(l);
    row.appendChild(v);
    parent.appendChild(row);
  }

  /**
   * Add a small status pill to the side panel. Pills highlight useful current
   * facts such as audio-only mode and the Enter key shortcut.
   */
  function addPill(parent, text) {
    var pill = document.createElement('span');
    pill.className = 'ss-pill';
    pill.textContent = text;
    parent.appendChild(pill);
  }

  /**
   * Produce the friendly label shown beside the current level. This keeps the
   * UI wording in sync with the level-to-answer-length rule.
   */
  function levelName() {
    var len = levelLength();
    if (len === 1) return 'single letters';
    return len + '-letter words';
  }

  /**
   * Clean a typed character so each box only stores one uppercase A-Z letter.
   * When the player enters a letter, focus moves to the next box automatically.
   */
  function handleBoxInput(event, idx) {
    var value = (event.target.value || '').toUpperCase().replace(/[^A-Z]/g, '');
    event.target.value = value.slice(-1);
    if (event.target.value && idx < currentAnswer.length - 1) {
      var next = document.getElementById('ss-box-' + (idx + 1));
      if (next) next.focus();
    }
  }

  /**
   * Handle keyboard shortcuts inside answer boxes. Enter submits the answer,
   * while Backspace moves naturally to the previous box when the current one is empty.
   */
  function handleBoxKey(event, idx) {
    if (event.key === 'Enter') {
      event.preventDefault();
      submitAnswer();
      return;
    }
    if (event.key === 'Backspace' && !event.target.value && idx > 0) {
      var previous = document.getElementById('ss-box-' + (idx - 1));
      if (previous) {
        previous.focus();
        previous.value = '';
      }
    }
  }

  /**
   * Let players paste a whole answer and spread it across the boxes. Extra
   * characters are ignored, and focus moves to the first empty box afterwards.
   */
  function handlePaste(event) {
    event.preventDefault();
    var text = (event.clipboardData || window.clipboardData).getData('text').toUpperCase().replace(/[^A-Z]/g, '');
    for (var i = 0; i < currentAnswer.length; i++) {
      var box = document.getElementById('ss-box-' + i);
      if (box) box.value = text[i] || '';
    }
    focusFirstEmptyBox();
  }

  /**
   * Spend one spare life to reveal three answer choices. The correct answer is
   * mixed with two same-length decoys, then the hint area is refreshed in place.
   */
  function buyHint() {
    if (resultMode || playing || hintUsed || lives <= 1) return;
    lives--;
    hintUsed = true;
    hintOptions = shuffledCopy([currentAnswer].concat(decoyAnswers()));
    updateHudOnly();
    updateControls();
    updateHintOptionsOnly();
    setMessage('Hint bought for 1 life. Pick carefully.', '');
  }

  /**
   * Fill the answer boxes from a clicked hint choice and immediately submit it.
   * A wrong hint choice still counts as a wrong answer, so the decoys matter.
   */
  function chooseHintAnswer(answer) {
    if (resultMode) return;
    for (var i = 0; i < currentAnswer.length; i++) {
      var box = document.getElementById('ss-box-' + i);
      if (box) box.value = answer[i] || '';
    }
    submitAnswer();
  }

  /**
   * Read the current answer boxes into a single uppercase string. The submit
   * logic uses this to compare the player's answer with the selected challenge.
   */
  function getTypedAnswer() {
    var chars = [];
    for (var i = 0; i < currentAnswer.length; i++) {
      var box = document.getElementById('ss-box-' + i);
      chars.push(box ? (box.value || '').toUpperCase() : '');
    }
    return chars.join('');
  }

  /**
   * Check the player's answer, update score/lives/streak, and lock the boxes.
   * It then hands off to the post-answer controls to continue, level up, or end.
   */
  function submitAnswer() {
    if (resultMode) return;
    var typed = getTypedAnswer();
    if (typed.length < currentAnswer.length) {
      setMessage('Fill every box before submitting.', 'bad');
      focusFirstEmptyBox();
      return;
    }

    resultMode = true;
    clearTimers();
    var correct = typed === currentAnswer;
    if (correct) {
      var points = scoreForCurrentChallenge();
      score += points;
      streak++;
      totalCorrect++;
      setMessage('Correct! +' + points + ' points. Signal decoded.', 'good');
    } else {
      lives--;
      streak = 0;
      totalWrong++;
      setMessage('Not quite. It was ' + currentAnswer + '.', 'bad');
    }

    showAnswerState(correct);
    updateHintOptionsOnly();
    renderAfterAnswerControls();
  }

  /**
   * Calculate the points for a correct answer. Longer words, higher levels,
   * faster timing, unused replays, and active streaks all add score.
   */
  function scoreForCurrentChallenge() {
    var base = currentAnswer.length * 90 + level * 25;
    var replayBonus = replaysLeft * 20;
    var speedBonus = Math.max(0, 190 - speedUnit());
    var streakBonus = Math.min(150, streak * 12);
    return base + replayBonus + speedBonus + streakBonus;
  }

  /**
   * Visually mark the submitted boxes as right or wrong and disable editing.
   * The HUD is refreshed at the same time so score and lives stay current.
   */
  function showAnswerState(correct) {
    for (var i = 0; i < currentAnswer.length; i++) {
      var box = document.getElementById('ss-box-' + i);
      if (box) {
        box.disabled = true;
        box.value = box.value || currentAnswer[i];
        box.style.borderColor = correct ? 'var(--ss-good)' : 'var(--ss-bad)';
      }
    }
    updateHudOnly();
  }

  /**
   * Replace active controls with the correct next step after an answer. Depending
   * on state, the player can continue, move to the next level, or view the summary.
   */
  function renderAfterAnswerControls() {
    var controls = document.querySelector('.ss-controls');
    if (!controls) return;
    controls.innerHTML = '';

    if (lives <= 0) {
      var summary = document.createElement('button');
      summary.className = 'ss-btn';
      summary.textContent = 'View Summary';
      summary.addEventListener('click', showSummary);
      controls.appendChild(summary);
      return;
    }

    if (challenge >= CHALLENGES_PER_LEVEL) {
      var levelScore = lives * 200 + level * 120 + streak * 15;
      score += levelScore;
      bestLevel = Math.max(bestLevel, level + 1);
      setMessage('Level clear! +' + levelScore + ' level bonus. Next level adds 1 life.', 'good');
      updateHudOnly();

      var nextLevel = document.createElement('button');
      nextLevel.className = 'ss-btn ss-btn--good';
      nextLevel.textContent = 'Next Level';
      nextLevel.addEventListener('click', advanceLevel);
      controls.appendChild(nextLevel);
      return;
    }

    var next = document.createElement('button');
    next.className = 'ss-btn';
    next.textContent = 'Next Signal';
    next.addEventListener('click', advanceChallenge);
    controls.appendChild(next);
  }

  /**
   * Move to the next challenge in the same level. It draws a new randomized
   * prompt, redraws the UI, and starts playback for the new signal.
   */
  function advanceChallenge() {
    challenge++;
    pickChallenge();
    render();
    playCurrentSignal(false);
  }

  /**
   * Start the next level after the player survives 15 challenges. The life limit
   * grows by one, lives refill to that new limit, and the next signal begins.
   */
  function advanceLevel() {
    level++;
    challenge = 1;
    maxLives++;
    lives = maxLives;
    bestLevel = Math.max(bestLevel, level);
    pickChallenge();
    render();
    playCurrentSignal(false);
  }

  /**
   * Show the friendly end-of-run screen when all lives are lost. The Try Again
   * button resets the game back to level 1 as requested.
   */
  function showSummary() {
    clearTimers();
    if (!frameEl) return;
    frameEl.innerHTML = '';

    var root = document.createElement('div');
    root.className = 'ss-root';
    var style = document.createElement('style');
    style.textContent = css();
    root.appendChild(style);

    var panel = document.createElement('div');
    panel.className = 'ss-panel ss-summary';

    var title = document.createElement('h2');
    title.textContent = 'Signal Sprint complete';

    var copy = document.createElement('p');
    copy.textContent = 'Final score: ' + score + '. You reached level ' + bestLevel + ' with ' + totalCorrect + ' correct signal' + (totalCorrect === 1 ? '' : 's') + '.';

    var retry = document.createElement('button');
    retry.className = 'ss-btn ss-btn--good';
    retry.textContent = 'Try Again';
    retry.addEventListener('click', function () {
      resetGame();
      render();
      playCurrentSignal(false);
    });

    panel.appendChild(title);
    panel.appendChild(copy);
    panel.appendChild(retry);
    root.appendChild(panel);
    frameEl.appendChild(root);
  }

  /**
   * Schedule the Morse playback for the current answer. It plays tones for each
   * dot/dash and, on visual levels, highlights the matching symbol in time.
   */
  function playCurrentSignal(forceVisual) {
    if (!active || resultMode) return;
    clearTimers();
    playing = true;
    updateControls();

    var context = ensureAudio();
    var unit = speedUnit();
    var cursor = 150;
    var audioStart = context ? context.currentTime + (cursor / 1000) : 0;
    var showVisual = forceVisual || !isAudioOnlyLevel();

    currentMorse.forEach(function (item, letterIndex) {
      item.code.split('').forEach(function (symbol, symbolIndex) {
        var duration = symbol === '-' ? unit * 3 : unit;
        var toneStart = audioStart + ((cursor - 150) / 1000);
        playTone(context, toneStart, duration);
        schedule(function () {
          if (showVisual) activateSymbol(letterIndex, symbolIndex, true);
        }, cursor);
        schedule(function () {
          if (showVisual) activateSymbol(letterIndex, symbolIndex, false);
        }, cursor + duration);
        cursor += duration + unit;
      });
      cursor += unit * 2;
    });

    schedule(function () {
      playing = false;
      updateControls();
      focusFirstBox();
    }, cursor + 40);
  }

  /**
   * Track a delayed action so it can be cancelled during replay, challenge
   * changes, or arcade unmount. This is the central timer bookkeeping helper.
   */
  function schedule(fn, delay) {
    var id = setTimeout(fn, delay);
    timers.push(id);
  }

  /**
   * Play one constant-volume pure sine tone for a dot or dash. Audio timing uses
   * the Web Audio render clock so UI thread delays cannot soften short symbols.
   */
  function playTone(context, startTime, durationMs) {
    if (!context) return;
    var osc = context.createOscillator();
    var gain = context.createGain();
    osc.frequency.value = TONE_FREQUENCY;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.7, startTime);
    osc.connect(gain);
    gain.connect(masterGain || context.destination);
    osc.start(startTime);
    osc.stop(startTime + (durationMs / 1000));

    var stop = function () {
      try { osc.stop(); } catch (err) {}
      try { osc.disconnect(); } catch (err2) {}
      try { gain.disconnect(); } catch (err3) {}
    };
    osc.onended = function () {
      stop();
      oscillatorStops = oscillatorStops.filter(function (candidate) { return candidate !== stop; });
    };
    oscillatorStops.push(stop);
  }

  /**
   * Turn the visual highlight on or off for one Morse symbol. Audio-only levels
   * skip this, but visual levels use it to sync the display with sound.
   */
  function activateSymbol(letterIndex, symbolIndex, activeState) {
    var el = document.getElementById('ss-symbol-' + letterIndex + '-' + symbolIndex);
    if (!el) return;
    if (activeState) el.classList.add('ss-symbol--active');
    else el.classList.remove('ss-symbol--active');
  }

  /**
   * Set the player feedback message below the controls. The optional tone changes
   * the color for positive or corrective messages.
   */
  function setMessage(text, tone) {
    var msg = document.getElementById('ss-message');
    if (!msg) return;
    msg.textContent = text;
    msg.className = 'ss-message' + (tone === 'good' ? ' ss-message--good' : tone === 'bad' ? ' ss-message--bad' : '');
  }

  /**
   * Refresh just the HUD without rebuilding the whole game screen. This keeps
   * score and lives current after answers and level bonuses.
   */
  function updateHudOnly() {
    var hud = document.querySelector('.ss-hud');
    if (!hud) return;
    hud.replaceWith(buildHud());
  }

  /**
   * Refresh active challenge controls, mainly to update replay count and disabled
   * state during playback. It does nothing once the answer has been submitted.
   */
  function updateControls() {
    var controls = document.querySelector('.ss-controls');
    if (!controls || resultMode) return;
    var replacement = buildControls();
    controls.replaceWith(replacement);
  }

  /**
   * Refresh only the hint choice row after a hint is bought or an answer ends.
   * This avoids rebuilding the whole screen while keeping choices in sync.
   */
  function updateHintOptionsOnly() {
    var options = document.querySelector('.ss-hint-options');
    if (!options) return;
    options.replaceWith(buildHintOptions());
  }

  /**
   * Put keyboard focus on the first answer box when a challenge is ready. This
   * lets desktop players keep playing without reaching for the mouse.
   */
  function focusFirstBox() {
    var first = document.getElementById('ss-box-0');
    if (first) first.focus();
  }

  /**
   * Find the first blank answer box and focus it. Validation and paste handling
   * use this to guide the player back to the next useful input.
   */
  function focusFirstEmptyBox() {
    for (var i = 0; i < currentAnswer.length; i++) {
      var box = document.getElementById('ss-box-' + i);
      if (box && !box.value) {
        box.focus();
        return;
      }
    }
    focusFirstBox();
  }

  /**
   * Expose the standalone lifecycle. mount() owns setup and rendering;
   * unmount() owns teardown so no audio or timers survive leaving the page.
   */
  window.SignalSprint = {
    gameId: 'signal_sprint',
    mount: function (frame) {
      active = true;
      frameEl = frame || document.getElementById('signal-sprint-game');
      started = false;
      stopAudio();
      render();
    },
    unmount: function () {
      active = false;
      frameEl = null;
      stopAudio();
    },
    getHighScore: function () {
      if (score <= 0) return null;
      return { gameId: 'signal_sprint', score: score };
    },
  };

  window.SignalSprint.mount();
  window.addEventListener('pagehide', function () {
    window.SignalSprint.unmount();
  });
  window.addEventListener('pageshow', function (event) {
    if (event.persisted) window.SignalSprint.mount();
  });
}());

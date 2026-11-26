const dateFormat = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };

document.getElementById('mastheadDate').textContent = new Date().toLocaleDateString('en-US', dateFormat);

async function fetchSourceItems(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) {
      return [];
    }
    return await response.json();
  } catch (error) {
    console.warn(`${url} failed:`, error);
    return [];
  }
}

async function requestBriefing(sourceList) {
  const sources = sourceList.map((item) => ({ source: item.source, title: item.title }));

  const response = await fetch('/api/briefing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(90000),
    body: JSON.stringify({ sources: sources }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`LLM error (${response.status}): ${data.error || 'Request failed'}`);
  }
  if (!data.briefing) {
    throw new Error('LLM returned an empty response.');
  }
  return data.briefing;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeUrl(url) {
  const isWebLink = typeof url === 'string' && /^https?:\/\//i.test(url);
  if (isWebLink) {
    return escapeHtml(url);
  }
  return '';
}

function makeCitationLink(numberText, sourceList) {
  const position = parseInt(numberText) - 1;
  const source = sourceList[position];

  let url = '';
  if (source) {
    url = safeUrl(source.url);
  }

  if (!url) {
    return numberText;
  }
  return `<a href="${url}" target="_blank" rel="noopener" title="${escapeHtml(source.title)}">${numberText}</a>`;
}

function addCitationLinks(html, sourceList) {
  return html.replace(/\[(\d+(?:,\s*\d+)*)\]/g, (fullMatch, numbersText) => {
    const numbers = numbersText.split(/,\s*/);
    const links = numbers.map((numberText) => makeCitationLink(numberText, sourceList));
    return `<sup class="cite">[${links.join(', ')}]</sup>`;
  });
}

function wrapParagraph(block) {
  block = block.trim();
  if (!block) {
    return '';
  }
  if (block.startsWith('<')) {
    return block;
  }
  return `<p>${block.replace(/\n/g, '<br>')}</p>`;
}

function markdownToHtml(text, sourceList) {
  let html = escapeHtml(text);

  html = html.replace(/```[\s\S]*?```/g, '');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/((?:<li>.*<\/li>\s*)+)/g, '<ul>$1</ul>');

  if (sourceList) {
    html = addCitationLinks(html, sourceList);
  }

  const blocks = html.split('\n\n');
  return blocks.map(wrapParagraph).join('\n');
}

function renderSourceList(sourceList) {
  if (!sourceList || sourceList.length === 0) {
    return '';
  }

  const listItems = sourceList.map((source, position) => {
    const number = position + 1;
    const url = safeUrl(source.url);
    const title = escapeHtml(source.title);

    let link = title;
    if (url) {
      link = `<a href="${url}" target="_blank" rel="noopener">${title}</a>`;
    }
    const sourceName = escapeHtml(source.source);
    const discussionUrl = safeUrl(source.discussionUrl);

    let sourceTag = `<span class="src-tag">${sourceName}</span>`;
    if (discussionUrl) {
      sourceTag = `<a class="src-tag" href="${discussionUrl}" target="_blank" rel="noopener" title="Open the discussion">${sourceName}</a>`;
    }

    return `<li id="src-${number}"><span class="src-num">${number}</span>${sourceTag}${link}</li>`;
  });

  return `<h2>Sources</h2><ol class="source-list">${listItems.join('\n')}</ol>`;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

let routeState = null;

function shuffle(list) {
  const shuffled = [...list];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temporary = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = temporary;
  }
  return shuffled;
}

function makePathFromPoints(points) {
  const pathParts = points.map((point, position) => {
    const command = position === 0 ? 'M' : 'L';
    return `${command} ${point.x} ${point.y}`;
  });
  return pathParts.join(' ');
}

function makeRandomCheckpoints() {
  const checkpointCount = 4 + Math.floor(Math.random() * 4);
  const start = { x: 60, y: 440 };
  const end = { x: 840, y: 60 };

  const middlePoints = [];
  for (let i = 0; i < checkpointCount - 2; i++) {
    middlePoints.push({
      x: 80 + Math.random() * 740,
      y: 70 + Math.random() * 370,
    });
  }

  const centerX = 450;
  const centerY = 250;
  const startAngle = Math.atan2(start.y - centerY, start.x - centerX);

  function angleFromStart(point) {
    const angle = Math.atan2(point.y - centerY, point.x - centerX);
    return (angle - startAngle + Math.PI * 3) % (Math.PI * 2);
  }

  middlePoints.sort((first, second) => angleFromStart(first) - angleFromStart(second));

  return [start, ...middlePoints, end];
}

function buildRoute() {
  const canvas = document.getElementById('routeCanvas');
  const checkpoints = makeRandomCheckpoints();
  const start = checkpoints[0];
  const shuffledLandmarks = shuffle(landmarks);

  let svg = '';
  svg += `<path class="route-path" d="${makePathFromPoints(checkpoints)}"/>`;
  svg += `<path class="route-path-progress" id="routeProgress" d="M ${start.x} ${start.y}"/>`;

  checkpoints.forEach((point, position) => {
    const landmark = shuffledLandmarks[position % shuffledLandmarks.length];
    svg += `<g transform="translate(${point.x}, ${point.y})">${landmark.draw()}</g>`;
    svg += `<circle cx="${point.x}" cy="${point.y}" r="3" fill="var(--dim)" opacity="0.4"/>`;
  });

  svg += `<g class="rider-group" id="routeRider" transform="translate(${start.x}, ${start.y})">`;
  svg += `<g id="routeRiderInner" transform="scale(0.9) translate(-28, -48)">${bikeSvg}</g>`;
  svg += `</g>`;

  canvas.innerHTML = svg;
  return checkpoints;
}

function distanceBetween(firstPoint, secondPoint) {
  const differenceX = secondPoint.x - firstPoint.x;
  const differenceY = secondPoint.y - firstPoint.y;
  return Math.sqrt(differenceX * differenceX + differenceY * differenceY);
}

function pointBetween(firstPoint, secondPoint, fraction) {
  return {
    x: firstPoint.x + (secondPoint.x - firstPoint.x) * fraction,
    y: firstPoint.y + (secondPoint.y - firstPoint.y) * fraction,
  };
}

function findRiderPosition(checkpoints, segmentLengths, distanceTravelled) {
  let distanceSoFar = 0;

  for (let i = 0; i < segmentLengths.length; i++) {
    if (distanceSoFar + segmentLengths[i] >= distanceTravelled) {
      const fraction = (distanceTravelled - distanceSoFar) / segmentLengths[i];
      const riderPoint = pointBetween(checkpoints[i], checkpoints[i + 1], fraction);
      return {
        riderPoint: riderPoint,
        nextPoint: checkpoints[i + 1],
        pathPoints: [...checkpoints.slice(0, i + 1), riderPoint],
      };
    }
    distanceSoFar += segmentLengths[i];
  }

  const lastPoint = checkpoints[checkpoints.length - 1];
  return {
    riderPoint: lastPoint,
    nextPoint: lastPoint,
    pathPoints: checkpoints,
  };
}

function startDelivery(checkpoints) {
  const rider = document.getElementById('routeRider');
  const riderInner = document.getElementById('routeRiderInner');
  const progress = document.getElementById('routeProgress');

  const segmentLengths = [];
  let totalLength = 0;
  for (let i = 1; i < checkpoints.length; i++) {
    const length = distanceBetween(checkpoints[i - 1], checkpoints[i]);
    segmentLengths.push(length);
    totalLength += length;
  }

  const lapDuration = 18000;
  const startTime = performance.now();

  routeState = {
    checkpoints: checkpoints,
    rider: rider,
    riderInner: riderInner,
    progress: progress,
    done: false,
    animationFrameId: null,
  };

  function drawFrame(now) {
    if (routeState.done) {
      return;
    }

    const timePassed = now - startTime;
    const lapFraction = (timePassed % lapDuration) / lapDuration;
    const distanceTravelled = lapFraction * totalLength;

    const position = findRiderPosition(checkpoints, segmentLengths, distanceTravelled);

    const isGoingLeft = position.nextPoint.x - position.riderPoint.x < 0;
    const horizontalScale = isGoingLeft ? -0.9 : 0.9;

    rider.setAttribute('transform', `translate(${position.riderPoint.x}, ${position.riderPoint.y})`);
    riderInner.setAttribute('transform', `scale(${horizontalScale}, 0.9) translate(-28, -48)`);
    progress.setAttribute('d', makePathFromPoints(position.pathPoints));

    routeState.animationFrameId = requestAnimationFrame(drawFrame);
  }

  routeState.animationFrameId = requestAnimationFrame(drawFrame);
}

function stopDelivery() {
  if (!routeState) {
    return;
  }
  routeState.done = true;
  if (routeState.animationFrameId) {
    cancelAnimationFrame(routeState.animationFrameId);
  }
}

function finishDelivery() {
  if (!routeState) {
    return;
  }
  stopDelivery();

  const checkpoints = routeState.checkpoints;
  const lastPoint = checkpoints[checkpoints.length - 1];

  routeState.rider.setAttribute('transform', `translate(${lastPoint.x}, ${lastPoint.y})`);
  routeState.riderInner.setAttribute('transform', `scale(0.9) translate(-28, -48)`);
  routeState.progress.setAttribute('d', makePathFromPoints(checkpoints));
}

function setStatus(message) {
  document.getElementById('loadingStatus').textContent = message;
}

function withTimeout(promise, milliseconds, message) {
  let timer;
  const timeoutPromise = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), milliseconds);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

async function showLoadingScreen() {
  document.getElementById('generateBtn').disabled = true;
  document.getElementById('launchState').classList.add('hidden');

  const transition = document.getElementById('transitionOverlay');
  transition.classList.add('active');
  await wait(500);
  transition.classList.remove('active');

  document.getElementById('loadingState').classList.add('active');
}

function sortResults(results) {
  const sourceNames = ['News feeds', 'Hacker News'];
  const succeeded = [];
  const failed = [];
  const itemsPerSource = [];

  results.forEach((result, position) => {
    if (result.status === 'fulfilled' && result.value.length > 0) {
      succeeded.push(sourceNames[position]);
      itemsPerSource.push(result.value);
    } else {
      failed.push(sourceNames[position]);
      itemsPerSource.push([]);
    }
  });

  return { succeeded, failed, itemsPerSource };
}

function makeMetaText(total, succeeded, failed, now) {
  let metaText = `${total} sources (${succeeded.join(', ')})`;
  if (failed.length) {
    metaText += ` // ${failed.join(', ')} unavailable`;
  }
  metaText += ` // generated ${now.toLocaleTimeString()}`;
  return metaText;
}

async function generate() {
  await showLoadingScreen();

  const timeoutMessage = 'Newspaper boy got lost en route. Please let us know and we will find a replacement tomorrow.';

  try {
    const route = buildRoute();
    startDelivery(route);

    setStatus('Pulling all feeds...');
    const results = await withTimeout(
      Promise.allSettled([
        fetchSourceItems('/api/feeds?limit=8'),
        fetchSourceItems('/api/hackernews?limit=15'),
      ]),
      30000,
      timeoutMessage
    );

    const { succeeded, failed, itemsPerSource } = sortResults(results);
    const sourceList = itemsPerSource.flat();
    const total = sourceList.length;

    if (total === 0) {
      throw new Error('All sources failed. Check your API keys and try again.');
    }

    setStatus('Delivering your edition...');
    const briefingText = await withTimeout(
      requestBriefing(sourceList),
      90000,
      timeoutMessage
    );

    const now = new Date();
    document.getElementById('briefingDate').textContent = now.toLocaleDateString('en-US', dateFormat);
    document.getElementById('briefingMeta').textContent = makeMetaText(total, succeeded, failed, now);
    document.getElementById('mainBriefing').innerHTML = markdownToHtml(briefingText, sourceList);
    document.getElementById('sourcePanel').innerHTML = renderSourceList(sourceList);

    finishDelivery();
    document.getElementById('loadingState').classList.remove('active');
    document.getElementById('briefingState').classList.add('active');
  } catch (error) {
    console.error(error);
    stopDelivery();
    document.getElementById('loadingState').classList.remove('active');
    document.getElementById('errorHeadline').textContent = error.message;
    document.getElementById('errorState').classList.add('active');
  }
}

function reset() {
  document.getElementById('briefingState').classList.remove('active');
  document.getElementById('errorState').classList.remove('active');
  document.getElementById('launchState').classList.remove('hidden');
  document.getElementById('generateBtn').disabled = false;
}

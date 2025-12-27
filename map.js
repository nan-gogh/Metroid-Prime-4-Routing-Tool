// Pure Canvas-based Interactive Map

const MAP_SIZE = 8192;
const RESOLUTIONS = [256, 512, 1024, 2048, 4096, 8192];
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 4;
const DEFAULT_ZOOM = 0.1;

// Load markers from JSON
const GREEN_CRYSTALS = [
    { uid: "gc01", x: 0.7520283696696498, y: 0.1076338471844772 },
    { uid: "gc02", x: 0.7931943389808889, y: 0.11358304260467755 },
    { uid: "gc03", x: 0.8022726454855946, y: 0.11505328933878133 },
    { uid: "gc04", x: 0.706610352057808, y: 0.1217328052582954 },
    { uid: "gc05", x: 0.631158866778797, y: 0.124089901997721 },
    { uid: "gc06", x: 0.8248862468995226, y: 0.12835540781756247 },
    { uid: "gc07", x: 0.6464266468343132, y: 0.13328340396663402 },
    { uid: "gc08", x: 0.5730628047979693, y: 0.13508713338772477 },
    { uid: "gc09", x: 0.6917008384267881, y: 0.13607392100895402 },
    { uid: "gc0a", x: 0.7332165859753791, y: 0.13765046838421696 },
    { uid: "gc0b", x: 0.4793017852211322, y: 0.13805843330389214 },
    { uid: "gc0c", x: 0.4930027792790151, y: 0.1397091554795407 },
    { uid: "gc0d", x: 0.4631247078997765, y: 0.14565175531187544 },
    { uid: "gc0e", x: 0.4604806271339152, y: 0.1469724504743375 },
    { uid: "gc0f", x: 0.8038653680519486, y: 0.15167040790446007 },
    { uid: "gc0g", x: 0.8124709363193269, y: 0.15599425399014105 },
    { uid: "gc0h", x: 0.6231089191681654, y: 0.15666110064518396 },
    { uid: "gc0i", x: 0.4135480185577986, y: 0.16639583065252542 },
    { uid: "gc0j", x: 0.4272850110720349, y: 0.1699856559285244 },
    { uid: "gc0k", x: 0.38543732038795425, y: 0.17749748752448705 },
    { uid: "gc0l", x: 0.8395185772261818, y: 0.1778688488219145 },
    { uid: "gc0m", x: 0.23202876983854367, y: 0.18176072726087383 },
    { uid: "gc0n", x: 0.21087778983508856, y: 0.1859153840472668 },
    { uid: "gc0o", x: 0.1895379617958883, y: 0.18629308011875703 },
    { uid: "gc0p", x: 0.6005594624429105, y: 0.19021224435683007 },
    { uid: "gc0q", x: 0.26639911234415825, y: 0.19063658494089517 },
    { uid: "gc0r", x: 0.36665577030057533, y: 0.19225665563481903 },
    { uid: "gc0s", x: 0.8548899141349956, y: 0.19397919231288277 },
    { uid: "gc0t", x: 0.29753966597902076, y: 0.20027011700543407 },
    { uid: "gc0u", x: 0.32959351146148086, y: 0.203024744351583 },
    { uid: "gc0v", x: 0.4139704421620723, y: 0.21250752981390084 },
    { uid: "gc0w", x: 0.8652360062851587, y: 0.21467137661320895 },
    { uid: "gc0x", x: 0.5940227553671347, y: 0.21674607302275783 },
    { uid: "gc0y", x: 0.16763158964945263, y: 0.22727310387545135 },
    { uid: "gc0z", x: 0.4482004834938257, y: 0.2302820755676249 },
    { uid: "gc10", x: 0.8531445884335479, y: 0.241295820782002 },
    { uid: "gc11", x: 0.5709837991832045, y: 0.24569355155079584 },
    { uid: "gc12", x: 0.17216394250733588, y: 0.25314528477253484 },
    { uid: "gc13", x: 0.285499829479373, y: 0.2543889319625496 },
    { uid: "gc14", x: 0.8904241868314178, y: 0.2582328918024499 },
    { uid: "gc15", x: 0.44915628942153696, y: 0.2625358091566239 },
    { uid: "gc16", x: 0.35336448717593966, y: 0.27043327649724525 },
    { uid: "gc17", x: 0.3232193960427594, y: 0.2712945648153361 },
    { uid: "gc18", x: 0.560741506929063, y: 0.28010765352471134 },
    { uid: "gc19", x: 0.6362057302913647, y: 0.2814120161805733 },
    { uid: "gc1a", x: 0.8618809371506533, y: 0.2887551401277477 },
    { uid: "gc1b", x: 0.2921371891932911, y: 0.28902820631535886 },
    { uid: "gc1c", x: 0.16819813375668805, y: 0.2997907496015832 },
    { uid: "gc1d", x: 0.48876693598057913, y: 0.3120272774761474 },
    { uid: "gc1e", x: 0.5141749022616727, y: 0.32012268117130177 },
    { uid: "gc1f", x: 0.17125842465448426, y: 0.3222235616069944 },
    { uid: "gc1g", x: 0.4175397452154686, y: 0.3317755249772398 },
    { uid: "gc1h", x: 0.514856037630509, y: 0.3362354150774068 },
    { uid: "gc1i", x: 0.8101847700147637, y: 0.3376044215388897 },
    { uid: "gc1j", x: 0.857431133361719, y: 0.3411742053375041 },
    { uid: "gc1k", x: 0.6768990888140191, y: 0.3446432348080825 },
    { uid: "gc1l", x: 0.5640451421338892, y: 0.3486822230997042 },
    { uid: "gc1m", x: 0.8309542691752875, y: 0.3489645581746359 },
    { uid: "gc1n", x: 0.17677699371031197, y: 0.3531987556622854 },
    { uid: "gc1o", x: 0.2776603207243659, y: 0.3533401155682799 },
    { uid: "gc1p", x: 0.8306970680043958, y: 0.35546997140082726 },
    { uid: "gc1q", x: 0.551825611503997, y: 0.3771944612361193 },
    { uid: "gc1r", x: 0.1787351956333476, y: 0.3786553806617487 },
    { uid: "gc1s", x: 0.8530290053318178, y: 0.38756179244912253 },
    { uid: "gc1t", x: 0.20027541678673969, y: 0.4021538037381764 },
    { uid: "gc1u", x: 0.7733110459292312, y: 0.40286604007895727 },
    { uid: "gc1v", x: 0.5641758860830156, y: 0.4032487131289577 },
    { uid: "gc1w", x: 0.43086617033188346, y: 0.40462783118593537 },
    { uid: "gc1x", x: 0.5206514997226068, y: 0.4050400603613233 },
    { uid: "gc1y", x: 0.8472392438024862, y: 0.4181648176755897 },
    { uid: "gc1z", x: 0.34715356214088905, y: 0.424489526952363 },
    { uid: "gc20", x: 0.2029456921363337, y: 0.43241692436690904 },
    { uid: "gc21", x: 0.7958489060340859, y: 0.43886401107976697 },
    { uid: "gc22", x: 0.8239147759271788, y: 0.4441360336785915 },
    { uid: "gc23", x: 0.4469610164874035, y: 0.4606032518759935 },
    { uid: "gc24", x: 0.4516464413523727, y: 0.4610142790750676 },
    { uid: "gc25", x: 0.4416977108836227, y: 0.4615635954813176 },
    { uid: "gc26", x: 0.5362174873118505, y: 0.46380856066106746 },
    { uid: "gc27", x: 0.7840554131569526, y: 0.4711154541204381 },
    { uid: "gc28", x: 0.4340608224495481, y: 0.47579958029908936 },
    { uid: "gc29", x: 0.8153358329204045, y: 0.48171347103639106 },
    { uid: "gc2a", x: 0.7931233154114594, y: 0.4827117864300515 },
    { uid: "gc2b", x: 0.5888925268040223, y: 0.48615244554733417 },
    { uid: "gc2c", x: 0.217187160667502, y: 0.48669274332458384 },
    { uid: "gc2d", x: 0.21009807410976492, y: 0.49245262615274527 },
    { uid: "gc2e", x: 0.3415629959363905, y: 0.49477093066605904 },
    { uid: "gc2f", x: 0.2321248787713052, y: 0.5013139843499166 },
    { uid: "gc2g", x: 0.8520239236374262, y: 0.5034268308485059 },
    { uid: "gc2h", x: 0.8220744618276126, y: 0.5061721981810722 },
    { uid: "gc2i", x: 0.6100046574198821, y: 0.5170482464485925 },
    { uid: "gc2j", x: 0.8038640792647351, y: 0.5236634433785833 },
    { uid: "gc2k", x: 0.5588598377317283, y: 0.5254040247392924 },
    { uid: "gc2l", x: 0.22933988048076565, y: 0.5392912337663653 },
    { uid: "gc2m", x: 0.36427428896507935, y: 0.5529739832888889 },
    { uid: "gc2n", x: 0.5597889043064734, y: 0.5830039594913828 },
    { uid: "gc2o", x: 0.2088321657958833, y: 0.5851171147288803 },
    { uid: "gc2p", x: 0.32677174448176394, y: 0.5938100571883866 },
    { uid: "gc2q", x: 0.19835154285714285, y: 0.5998552941714286 },
    { uid: "gc2r", x: 0.8231053096246383, y: 0.6075579589513878 },
    { uid: "gc2s", x: 0.3617177608126984, y: 0.6083654265904762 },
    { uid: "gc2t", x: 0.5612533684710175, y: 0.616872795974777 },
    { uid: "gc2u", x: 0.7978653135313465, y: 0.6182331011194583 },
    { uid: "gc2v", x: 0.8285635118864055, y: 0.6199801530583641 },
    { uid: "gc2w", x: 0.5773016283428571, y: 0.6427817837714286 },
    { uid: "gc2x", x: 0.5609431006395462, y: 0.6435558294812986 },
    { uid: "gc2y", x: 0.1590449225142857, y: 0.6501869421714286 },
    { uid: "gc2z", x: 0.16623515794285715, y: 0.6696005778285714 },
    { uid: "gc30", x: 0.6351334475620903, y: 0.6729602018366408 },
    { uid: "gc31", x: 0.8221380895998442, y: 0.6742187630601948 },
    { uid: "gc32", x: 0.8517743447890112, y: 0.6831236017073878 },
    { uid: "gc33", x: 0.4051787394031746, y: 0.7106265526857143 },
    { uid: "gc34", x: 0.6365896500801109, y: 0.713733872341219 },
    { uid: "gc35", x: 0.12477146697142856, y: 0.7180148297142858 },
    { uid: "gc36", x: 0.30798096180073736, y: 0.7181381748186573 },
    { uid: "gc37", x: 0.8583062912123753, y: 0.720686193311239 },
    { uid: "gc38", x: 0.8330004238626683, y: 0.7274347554399778 },
    { uid: "gc39", x: 0.11877960411428572, y: 0.7398252105142857 },
    { uid: "gc3a", x: 0.2944251533985405, y: 0.7401287084488878 },
    { uid: "gc3b", x: 0.7922383338529144, y: 0.744436669938311 },
    { uid: "gc3c", x: 0.6577045865914104, y: 0.7508670365507455 },
    { uid: "gc3d", x: 0.5869327049151222, y: 0.7607379214515586 },
    { uid: "gc3e", x: 0.8363441337140071, y: 0.7627798465804017 },
    { uid: "gc3f", x: 0.8064774372452684, y: 0.7807782621784983 },
    { uid: "gc3g", x: 0.45014839532417944, y: 0.781471470115867 },
    { uid: "gc3h", x: 0.5981515570538205, y: 0.7838518766141075 },
    { uid: "gc3i", x: 0.16124992804571428, y: 0.7864179360914286 },
    { uid: "gc3j", x: 0.14284292534857143, y: 0.7892940302628572 },
    { uid: "gc3k", x: 0.6445776781167637, y: 0.790555078954089 },
    { uid: "gc3l", x: 0.7467132537412693, y: 0.8071118922378204 },
    { uid: "gc3m", x: 0.8081637599548551, y: 0.8116149464171905 },
    { uid: "gc3n", x: 0.6690944312612654, y: 0.8125215221388065 },
    { uid: "gc3o", x: 0.6392538928861495, y: 0.8151534803958427 },
    { uid: "gc3p", x: 0.7122998546448659, y: 0.8170040029092562 },
    { uid: "gc3q", x: 0.43566205987603135, y: 0.8188703348400165 },
    { uid: "gc3r", x: 0.125703197065268, y: 0.8216203743125374 },
    { uid: "gc3s", x: 0.3146082459084781, y: 0.828693323343241 },
    { uid: "gc3t", x: 0.11721426919621648, y: 0.8466403722423735 },
    { uid: "gc3u", x: 0.2852307851648384, y: 0.8635282127814501 },
    { uid: "gc3v", x: 0.33963095801646853, y: 0.8650426942082772 },
    { uid: "gc3w", x: 0.6189558454296391, y: 0.8652088595604414 },
    { uid: "gc3x", x: 0.1357558748049343, y: 0.8679743883343319 },
    { uid: "gc3y", x: 0.4115214409142857, y: 0.8689954084571428 },
    { uid: "gc3z", x: 0.08906677152515088, y: 0.8694264417856171 },
    { uid: "gc40", x: 0.22380341849273044, y: 0.8731603146560706 },
    { uid: "gc41", x: 0.3772839547204777, y: 0.8812506169641718 },
    { uid: "gc42", x: 0.18563848653668705, y: 0.8873358608111724 },
    { uid: "gc43", x: 0.6110731085533243, y: 0.89122189125228 },
    { uid: "gc44", x: 0.43525793515920647, y: 0.9037737109578298 },
    { uid: "gc45", x: 0.5962929769102342, y: 0.9071844334268174 },
    { uid: "gc46", x: 0.4841240945155491, y: 0.9149932696449168 },
    { uid: "gc47", x: 0.5265307555548486, y: 0.9245264545547098 },
    { uid: "gc48", x: 0.5531349925124109, y: 0.9257088650861572 },
    { uid: "gc49", x: 0.5856512821272093, y: 0.9308326440557616 },
    { uid: "gc4a", x: 0.5966871137540499, y: 0.9320150545872088 }
];

class InteractiveMap {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        
        // Map state
        this.zoom = DEFAULT_ZOOM;
        this.panX = 0;
        this.panY = 0;
        
        // Interaction state
        this.isDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        // Pointer/touch state
        this.pointers = new Map(); // pointerId -> {x,y,clientX,clientY,downTime}
        this.pinch = null; // {startDistance, startZoom}
        this.lastTap = 0;
        
        // Images cache
        this.images = {};
        this.currentImage = null;
        this.currentResolution = 0;
        this.loadingResolution = null;
        
        // Markers
        this.markers = [];
        this.showMarkers = true;
        this.hoveredMarker = null;
        
        // Tooltip element
        this.tooltip = document.getElementById('tooltip');
        
        // Setup
        this.resize();
        this.bindEvents();
        this.centerMap();
        this.loadInitialImage();
        this.render();
    }
    
    resize() {
        const container = this.canvas.parentElement;
        const cssWidth = container.clientWidth;
        const cssHeight = container.clientHeight;
        const dpr = window.devicePixelRatio || 1;
        this.dpr = dpr;

        // Set CSS size and backing store size for high-DPI displays
        this.canvas.style.width = cssWidth + 'px';
        this.canvas.style.height = cssHeight + 'px';
        this.canvas.width = Math.max(1, Math.floor(cssWidth * dpr));
        this.canvas.height = Math.max(1, Math.floor(cssHeight * dpr));

        // Scale drawing so we can use CSS pixels in drawing code
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.updateResolution();
        this.render();
    }
    
    centerMap() {
        const cssWidth = this.canvas.clientWidth;
        const cssHeight = this.canvas.clientHeight;
        const mapWidth = MAP_SIZE * this.zoom;
        const mapHeight = MAP_SIZE * this.zoom;
        this.panX = (cssWidth - mapWidth) / 2;
        this.panY = (cssHeight - mapHeight) / 2;
    }
    
    bindEvents() {
        // Mouse wheel zoom
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
            const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.zoom * zoomFactor));
            
            // Zoom towards mouse position
            const worldX = (mouseX - this.panX) / this.zoom;
            const worldY = (mouseY - this.panY) / this.zoom;
            
            this.zoom = newZoom;
            
            this.panX = mouseX - worldX * this.zoom;
            this.panY = mouseY - worldY * this.zoom;
            
            this.updateResolution();
            this.render();
        });
        // Pointer events (unified for mouse + touch + pen)
        this.canvas.addEventListener('pointerdown', (e) => {
            this.canvas.setPointerCapture(e.pointerId);
            const rect = this.canvas.getBoundingClientRect();
            const localX = e.clientX - rect.left;
            const localY = e.clientY - rect.top;
            this.pointers.set(e.pointerId, { x: localX, y: localY, clientX: e.clientX, clientY: e.clientY, downTime: Date.now() });

            if (this.pointers.size === 1) {
                // start single-pointer pan
                this.isDragging = true;
                this.lastMouseX = e.clientX;
                this.lastMouseY = e.clientY;
                this.canvas.style.cursor = 'grabbing';
            } else if (this.pointers.size === 2) {
                // begin pinch
                const pts = Array.from(this.pointers.values());
                const dx = pts[0].clientX - pts[1].clientX;
                const dy = pts[0].clientY - pts[1].clientY;
                const dist = Math.hypot(dx, dy);
                this.pinch = { startDistance: dist, startZoom: this.zoom };
                this.isDragging = false;
            }
        });

        this.canvas.addEventListener('pointermove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const localX = e.clientX - rect.left;
            const localY = e.clientY - rect.top;

            if (this.pointers.has(e.pointerId)) {
                const p = this.pointers.get(e.pointerId);
                p.x = localX; p.y = localY; p.clientX = e.clientX; p.clientY = e.clientY;
            }

            if (this.pointers.size === 2 && this.pinch) {
                // handle pinch-to-zoom
                const pts = Array.from(this.pointers.values());
                const dx = pts[0].clientX - pts[1].clientX;
                const dy = pts[0].clientY - pts[1].clientY;
                const dist = Math.hypot(dx, dy);
                const factor = dist / this.pinch.startDistance;
                const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.pinch.startZoom * factor));

                // zoom towards midpoint
                const midClientX = (pts[0].clientX + pts[1].clientX) / 2;
                const midClientY = (pts[0].clientY + pts[1].clientY) / 2;
                const worldX = (midClientX - rect.left - this.panX) / this.zoom;
                const worldY = (midClientY - rect.top - this.panY) / this.zoom;

                this.zoom = newZoom;
                this.panX = midClientX - rect.left - worldX * this.zoom;
                this.panY = midClientY - rect.top - worldY * this.zoom;

                this.updateResolution();
                this.render();
                return;
            }

            if (this.isDragging) {
                this.panX += e.clientX - this.lastMouseX;
                this.panY += e.clientY - this.lastMouseY;
                this.lastMouseX = e.clientX;
                this.lastMouseY = e.clientY;
                this.render();
            } else {
                // pointer hover (or mouse move) - check markers
                this.checkMarkerHover(localX, localY);
            }
        });

        this.canvas.addEventListener('pointerup', (e) => {
            this.canvas.releasePointerCapture && this.canvas.releasePointerCapture(e.pointerId);
            const rect = this.canvas.getBoundingClientRect();
            const localX = e.clientX - rect.left;
            const localY = e.clientY - rect.top;

            const p = this.pointers.get(e.pointerId);
            const downTime = p ? p.downTime : 0;
            const dt = Date.now() - downTime;
            const moved = p ? (Math.hypot(p.clientX - e.clientX, p.clientY - e.clientY) > 8) : true;

            this.pointers.delete(e.pointerId);

            if (this.pointers.size < 2) this.pinch = null;

            if (this.pointers.size === 0) {
                // finalize drag
                this.isDragging = false;
                this.canvas.style.cursor = this.hoveredMarker ? 'pointer' : 'grab';

                // treat short tap (no movement, short press) as click/tap
                if (!moved && dt < 300) {
                    const now = Date.now();
                    if (now - this.lastTap < 300) {
                        // double-tap -> zoom in centered
                        const centerX = localX;
                        const centerY = localY;
                        const worldX = (centerX - this.panX) / this.zoom;
                        const worldY = (centerY - this.panY) / this.zoom;
                        this.zoom = Math.min(MAX_ZOOM, this.zoom * 1.6);
                        this.panX = centerX - worldX * this.zoom;
                        this.panY = centerY - worldY * this.zoom;
                        this.updateResolution();
                        this.render();
                        this.lastTap = 0;
                    } else {
                        // single tap: check markers and show tooltip or click
                        this.checkMarkerHover(localX, localY);
                        if (this.hoveredMarker) {
                            console.log('Marker tapped:', this.hoveredMarker);
                            this.showTooltip(this.hoveredMarker, localX, localY);
                        }
                        this.lastTap = now;
                    }
                }
            }
        });

        this.canvas.addEventListener('pointercancel', (e) => {
            this.pointers.delete(e.pointerId);
            if (this.pointers.size === 0) {
                this.isDragging = false;
                this.pinch = null;
                this.canvas.style.cursor = 'grab';
            }
        });

        // pointerleave similar to mouseleave
        this.canvas.addEventListener('mouseleave', () => {
            this.isDragging = false;
            this.canvas.style.cursor = 'grab';
            this.hideTooltip();
        });
        
        // Click on markers
        this.canvas.addEventListener('click', (e) => {
            if (this.hoveredMarker) {
                console.log('Marker clicked:', this.hoveredMarker);
                // Could open a popup, mark as collected, etc.
            }
        });
        
        // Window resize
        window.addEventListener('resize', () => {
            this.resize();
            this.render();
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === '+' || e.key === '=') {
                this.zoomIn();
            } else if (e.key === '-') {
                this.zoomOut();
            } else if (e.key === '0') {
                this.resetView();
            }
        });
    }
    
    zoomIn() {
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const worldX = (centerX - this.panX) / this.zoom;
        const worldY = (centerY - this.panY) / this.zoom;
        
        this.zoom = Math.min(MAX_ZOOM, this.zoom * 1.3);
        
        this.panX = centerX - worldX * this.zoom;
        this.panY = centerY - worldY * this.zoom;
        
        this.updateResolution();
        this.render();
    }
    
    zoomOut() {
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const worldX = (centerX - this.panX) / this.zoom;
        const worldY = (centerY - this.panY) / this.zoom;
        
        this.zoom = Math.max(MIN_ZOOM, this.zoom / 1.3);
        
        this.panX = centerX - worldX * this.zoom;
        this.panY = centerY - worldY * this.zoom;
        
        this.updateResolution();
        this.render();
    }
    
    resetView() {
        this.zoom = DEFAULT_ZOOM;
        this.centerMap();
        this.updateResolution();
        this.render();
    }
    
    loadInitialImage() {
        const needed = this.getNeededResolution();
        this.loadImage(needed);
    }
    
    loadImage(resolutionIndex) {
        const size = RESOLUTIONS[resolutionIndex];
        
        if (this.images[resolutionIndex]) {
            this.currentImage = this.images[resolutionIndex];
            this.currentResolution = resolutionIndex;
            this.render();
            return;
        }
        
        if (this.loadingResolution === resolutionIndex) return;
        this.loadingResolution = resolutionIndex;
        
        const img = new Image();
        img.onload = () => {
            this.images[resolutionIndex] = img;
            this.loadingResolution = null;
            
            // Always use this image if we don't have one yet, or if it's the best choice
            if (!this.currentImage || resolutionIndex === this.getNeededResolution()) {
                this.currentImage = img;
                this.currentResolution = resolutionIndex;
                this.render();
            }
            this.updateResolution();
        };
        img.onerror = () => {
            this.loadingResolution = null;
            console.error(`Failed to load: ${size}px`);
        };
        img.src = `tiles/${size}.avif`;
    }
    
    getNeededResolution() {
        // Calculate displayed size of the map on screen in CSS pixels
        const displayedCss = MAP_SIZE * this.zoom;
        const dpr = window.devicePixelRatio || 1;
        const displayedPx = displayedCss * dpr;

        // Find the smallest resolution that covers the displayed size in device pixels
        for (let i = 0; i < RESOLUTIONS.length; i++) {
            if (RESOLUTIONS[i] >= displayedPx) {
                return i;
            }
        }
        return RESOLUTIONS.length - 1;
    }
    
    updateResolution() {
        const needed = this.getNeededResolution();
        
        if (needed !== this.currentResolution && this.loadingResolution !== needed) {
            this.loadImage(needed);
        }
        
        // Update status display
        const status = document.getElementById('resolutionStatus');
        if (status) {
            const res = RESOLUTIONS[this.currentResolution] || RESOLUTIONS[0];
            status.textContent = `${res}px`;
        }
        
        const zoomStatus = document.getElementById('zoomStatus');
        if (zoomStatus) {
            zoomStatus.textContent = `${(this.zoom * 100).toFixed(0)}%`;
        }
    }
    
    setMarkers(markers) {
        this.markers = markers;
        this.render();
        
        const count = document.getElementById('crystalCount');
        if (count) count.textContent = markers.length;
    }
    
    toggleMarkers(show) {
        this.showMarkers = show;
        this.render();
    }
    
    checkMarkerHover(mouseX, mouseY) {
        if (!this.showMarkers) {
            this.hoveredMarker = null;
            this.hideTooltip();
            return;
        }
        
        const markerRadius = Math.max(8, 12 * this.zoom);
        let found = null;
        
        for (let i = this.markers.length - 1; i >= 0; i--) {
            const marker = this.markers[i];
            const screenX = marker.x * MAP_SIZE * this.zoom + this.panX;
            const screenY = marker.y * MAP_SIZE * this.zoom + this.panY;
            
            const dist = Math.hypot(mouseX - screenX, mouseY - screenY);
            if (dist < markerRadius) {
                found = { ...marker, index: i };
                break;
            }
        }
        
        if (found !== this.hoveredMarker) {
            this.hoveredMarker = found;
            this.canvas.style.cursor = found ? 'pointer' : 'grab';
            
            if (found) {
                this.showTooltip(found, mouseX, mouseY);
            } else {
                this.hideTooltip();
            }
            
            this.render();
        }
    }
    
    showTooltip(marker, x, y) {
        if (!this.tooltip) return;
        this.tooltip.textContent = `Green Crystal #${marker.index + 1}`;
        this.tooltip.style.left = `${x + 15}px`;
        this.tooltip.style.top = `${y - 10}px`;
        this.tooltip.style.display = 'block';
    }
    
    hideTooltip() {
        if (this.tooltip) {
            this.tooltip.style.display = 'none';
        }
    }
    
    render() {
        const ctx = this.ctx;
        const cssWidth = this.canvas.clientWidth;
        const cssHeight = this.canvas.clientHeight;

        // Clear canvas (using CSS pixel sizes since context is scaled)
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, cssWidth, cssHeight);
        
        // Draw map image
        if (this.currentImage) {
            const size = MAP_SIZE * this.zoom;
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(this.currentImage, this.panX, this.panY, size, size);
        }
        
        // Draw markers
        if (this.showMarkers) {
            this.renderMarkers();
        }
    }
    
    renderMarkers() {
        const ctx = this.ctx;
        const baseSize = Math.max(6, Math.min(16, 10 * this.zoom));
        const cssWidth = this.canvas.clientWidth;
        const cssHeight = this.canvas.clientHeight;
        
        this.markers.forEach((marker, index) => {
            const screenX = marker.x * MAP_SIZE * this.zoom + this.panX;
            const screenY = marker.y * MAP_SIZE * this.zoom + this.panY;
            
            // Skip if off-screen
            if (screenX < -20 || screenX > cssWidth + 20 ||
                screenY < -20 || screenY > cssHeight + 20) {
                return;
            }
            
            const isHovered = this.hoveredMarker && this.hoveredMarker.index === index;
            const size = isHovered ? baseSize * 1.4 : baseSize;
            
            // Outer glow
            ctx.beginPath();
            ctx.arc(screenX, screenY, size + 3, 0, Math.PI * 2);
            ctx.fillStyle = isHovered ? 'rgba(74, 222, 128, 0.4)' : 'rgba(74, 222, 128, 0.2)';
            ctx.fill();
            
            // Main circle
            ctx.beginPath();
            ctx.arc(screenX, screenY, size, 0, Math.PI * 2);
            const gradient = ctx.createRadialGradient(screenX - size/3, screenY - size/3, 0, screenX, screenY, size);
            gradient.addColorStop(0, '#86efac');
            gradient.addColorStop(1, '#22c55e');
            ctx.fillStyle = gradient;
            ctx.fill();
            
            // Border
            ctx.strokeStyle = isHovered ? '#ffffff' : '#166534';
            ctx.lineWidth = isHovered ? 2 : 1.5;
            ctx.stroke();
            
            // Highlight
            ctx.beginPath();
            ctx.arc(screenX - size/3, screenY - size/3, size/4, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.fill();
        });
    }
}

// Initialize
let map;

async function init() {
    // Create map
    map = new InteractiveMap('mapCanvas');
    map.setMarkers(GREEN_CRYSTALS);
    
    // Setup controls
    document.getElementById('zoomIn').addEventListener('click', () => map.zoomIn());
    document.getElementById('zoomOut').addEventListener('click', () => map.zoomOut());
    document.getElementById('resetView').addEventListener('click', () => map.resetView());
    
    document.getElementById('toggleCrystals').addEventListener('change', (e) => {
        map.toggleMarkers(e.target.checked);
    });

    // Sidebar toggle logic
    const app = document.querySelector('.app-container');
    // Support multiple possible handle IDs for backwards compatibility
    const handle = document.getElementById('sidebarHandle') || document.getElementById('sidebarToggle');
    const SIDEBAR_KEY = 'mp4_sidebar_collapsed';

    function setSidebarCollapsed(collapsed, persist = true) {
        if (collapsed) {
            app.classList.add('sidebar-collapsed');
            handle && handle.setAttribute('aria-expanded', 'false');
        } else {
            app.classList.remove('sidebar-collapsed');
            handle && handle.setAttribute('aria-expanded', 'true');
        }
        if (persist) localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0');
        // Resize map after sidebar animation
        setTimeout(() => map.resize(), 300);
    }

    if (handle) {
        handle.addEventListener('click', () => {
            const collapsed = app.classList.contains('sidebar-collapsed');
            setSidebarCollapsed(!collapsed);
        });
    } else {
        console.warn('Sidebar handle element not found; collapsing unavailable');
    }

    // Restore saved preference; default collapsed on mobile
    const saved = localStorage.getItem(SIDEBAR_KEY);
    if (window.innerWidth <= 720) {
        setSidebarCollapsed(saved !== '0', false);
    } else {
        if (saved === '1') setSidebarCollapsed(true, false);
    }
}

document.addEventListener('DOMContentLoaded', init);

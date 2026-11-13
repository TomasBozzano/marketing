
import { supabase } from './service/supabase.service.js';

// CONFIGURACIÓN
const BUCKET = 'public-arjun';
const CARPETA = '327/21';
const DURACION_IMAGEN = 5000;
const ROTACION = 'rotate(90deg)';
const EXTENSIONES_VIDEO = new Set([
    'mp4',
    'm4v',
    'webm',
    'mov',
    'ogv',
    'ogg',
    'mkv',
    'avi',
    '3gp',
    'ts',
    'm3u8'
]);
const EXTENSIONES_IMAGEN = new Set([
    'jpg',
    'jpeg',
    'png',
    'gif',
    'webp',
    'avif',
    'bmp'
]);

let elementosCarrusel = [];
let indiceActual = 0;
let timeoutCarrusel = null;
let carruselIniciado = false;
let ultimaInteraccionInicio = 0;
const animacionesVideo = new WeakMap();
const reintentosVideo = new WeakMap();
const temporizadoresFinVideo = new WeakMap();
const videosPorSlide = new WeakMap();
const parametrosPagina = new URLSearchParams(window.location.search);
const DEBUG_ACTIVO = parametrosPagina.get('debug') === '1';
const ID_SESION_LOG = `tv-${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 8)}`;
let logsDiagnostico = [];
let salidaLogs = null;
let sincronizacionLogsEnCurso = false;

function formatearLogsTxt() {
    return [
        `ARJUN TV - SESIÓN ${ID_SESION_LOG}`,
        `Generado: ${new Date().toISOString()}`,
        `URL: ${window.location.href}`,
        '',
        ...logsDiagnostico.map(log => JSON.stringify(log))
    ].join('\r\n');
}

function descargarLogsTxt() {
    const blob = new Blob(
        [formatearLogsTxt()],
        { type: 'text/plain;charset=utf-8' }
    );
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');

    enlace.href = url;
    enlace.download = `arjun-tv-${ID_SESION_LOG}.txt`;
    enlace.click();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function sincronizarLogsTxt() {
    if (!DEBUG_ACTIVO || sincronizacionLogsEnCurso || logsDiagnostico.length === 0) {
        return;
    }

    sincronizacionLogsEnCurso = true;

    try {
        const { error } = await supabase
            .storage
            .from(BUCKET)
            .upload(
                `debug/${ID_SESION_LOG}.txt`,
                new Blob([formatearLogsTxt()], {
                    type: 'text/plain;charset=utf-8'
                }),
                {
                    contentType: 'text/plain;charset=utf-8',
                    upsert: true
                }
            );

        if (error) {
            console.warn('No se pudo sincronizar el log TXT:', error);
        }
    } catch (error) {
        console.warn('Error sincronizando el log TXT:', error);
    } finally {
        sincronizacionLogsEnCurso = false;
    }
}

function describirElemento(elemento) {
    if (!(elemento instanceof Element)) {
        return '';
    }

    const identificador = elemento.id ? `#${elemento.id}` : '';
    const clases = typeof elemento.className === 'string' && elemento.className
        ? `.${elemento.className.trim().replace(/\s+/g, '.')}`
        : '';

    return `${elemento.tagName.toLowerCase()}${identificador}${clases}`;
}

function registrarLog(evento, detalles = {}) {
    const registro = {
        hora: new Date().toISOString(),
        evento,
        ...detalles
    };

    if (DEBUG_ACTIVO) {
        logsDiagnostico.push(registro);
        logsDiagnostico = logsDiagnostico.slice(-200);

        renderizarLogs();

        // Se actualiza una copia en Supabase cada 10 eventos. La descarga
        // manual sigue disponible por si la política de Storage no permite
        // escritura anónima.
        if (logsDiagnostico.length % 10 === 0) {
            void sincronizarLogsTxt();
        }
    }

    console.info('[ARJUN-TV]', registro);
}

function renderizarLogs() {
    if (!salidaLogs) {
        return;
    }

    salidaLogs.textContent = logsDiagnostico
        .slice(-40)
        .map(log => JSON.stringify(log))
        .join('\n');

    salidaLogs.scrollTop = salidaLogs.scrollHeight;
}

function crearPanelDiagnostico() {
    if (!DEBUG_ACTIVO) {
        return;
    }

    const panel = document.createElement('section');
    panel.id = 'panel-diagnostico-tv';
    panel.innerHTML = `
        <header class="panel-diagnostico-tv__header">
            <strong>Diagnóstico TV</strong>
            <div class="panel-diagnostico-tv__acciones">
                <button type="button" data-debug-action="download-txt">Guardar TXT</button>
                <button type="button" data-debug-action="clear">Limpiar</button>
            </div>
        </header>
        <pre id="salida-logs-tv" aria-live="polite"></pre>
    `;

    document.body.appendChild(panel);
    salidaLogs = panel.querySelector('#salida-logs-tv');

    panel.addEventListener('click', event => {
        const boton = event.target.closest('[data-debug-action]');

        if (!boton) {
            return;
        }

        const accion = boton.dataset.debugAction;
        registrarLog('debug.panel.action', { accion });

        if (accion === 'clear') {
            logsDiagnostico = [];
            renderizarLogs();
        }

        if (accion === 'download-txt') {
            descargarLogsTxt();
            void sincronizarLogsTxt();
        }
    });

    renderizarLogs();
}

function instalarCapturaDeInteracciones() {
    if (!DEBUG_ACTIVO) {
        return;
    }

    const registrarEventoUsuario = evento => {
        registrarLog(evento.type, {
            objetivo: describirElemento(evento.target),
            key: evento.key,
            code: evento.code,
            keyCode: evento.keyCode,
            button: evento.button,
            pointerType: evento.pointerType,
            isTrusted: evento.isTrusted,
            defaultPrevented: evento.defaultPrevented,
            repeat: evento.repeat
        });
    };

    window.addEventListener('keydown', registrarEventoUsuario, true);
    window.addEventListener('keyup', registrarEventoUsuario, true);
    window.addEventListener('click', registrarEventoUsuario, true);
    window.addEventListener('pointerdown', registrarEventoUsuario, true);
    window.addEventListener('pointerup', registrarEventoUsuario, true);
    window.addEventListener('touchstart', registrarEventoUsuario, true);
    window.addEventListener('touchend', registrarEventoUsuario, true);
    window.addEventListener('focusin', registrarEventoUsuario, true);
    window.addEventListener('focusout', registrarEventoUsuario, true);
    document.addEventListener('visibilitychange', () => {
        registrarLog('document.visibilitychange', {
            visibilityState: document.visibilityState
        });
    });
    window.addEventListener('error', evento => {
        registrarLog('window.error', {
            message: evento.message,
            source: evento.filename,
            line: evento.lineno,
            column: evento.colno
        });
    });
    window.addEventListener('unhandledrejection', evento => {
        registrarLog('window.unhandledrejection', {
            reason: evento.reason instanceof Error
                ? evento.reason.message
                : String(evento.reason)
        });
    });
}

const ES_ENTORNO_TV = (() => {
    const parametros = new URLSearchParams(window.location.search);
    const userAgent = navigator.userAgent || '';
    const esAndroidSinMobile = /Android/i.test(userAgent) &&
        !/Mobile|Tablet/i.test(userAgent);

    return parametros.get('tv') === '1' ||
        /Android TV|GoogleTV|SmartTV|HbbTV|Tizen|Web0S|NetCast|BRAVIA|Viera/i.test(userAgent) ||
        esAndroidSinMobile;
})();

function obtenerExtension(nombre) {
    return nombre
        .split('.')
        .pop()
        ?.toLowerCase() || '';
}

function obtenerTipoArchivo(archivo) {
    const mimeType = archivo.metadata?.mimetype?.toLowerCase() || '';
    const extension = obtenerExtension(archivo.name);

    if (mimeType.startsWith('video/') || EXTENSIONES_VIDEO.has(extension)) {
        return 'VIDEO';
    }

    if (mimeType.startsWith('image/') || EXTENSIONES_IMAGEN.has(extension)) {
        return 'IMAGEN';
    }

    return null;
}

function obtenerMimeType(archivo) {
    const mimeType = archivo.metadata?.mimetype || '';

    if (mimeType) {
        return mimeType;
    }

    const mimeTypesPorExtension = {
        mp4: 'video/mp4',
        m4v: 'video/mp4',
        webm: 'video/webm',
        mov: 'video/quicktime',
        ogv: 'video/ogg',
        ogg: 'video/ogg',
        mkv: 'video/x-matroska',
        avi: 'video/x-msvideo',
        '3gp': 'video/3gpp',
        ts: 'video/mp2t',
        m3u8: 'application/vnd.apple.mpegurl'
    };

    return mimeTypesPorExtension[obtenerExtension(archivo.name)] || '';
}

// Obtener archivos de Supabase
async function obtenerArchivos() {
    registrarLog('storage.list.start', {
        bucket: BUCKET,
        carpeta: CARPETA
    });

    try {
        const { data, error } = await supabase
            .storage
            .from(BUCKET)
            .list(CARPETA, {
                limit: 100,
                offset: 0,
                sortBy: {
                    column: 'name',
                    order: 'asc'
                }
            });

        if (error) {
            throw error;
        }

        // Filtrar únicamente imágenes y videos
        const archivos = data.filter(archivo => {
            return obtenerTipoArchivo(archivo) !== null;
        });

        const resultado = archivos.map(archivo => {
            const { data: urlData } = supabase
                .storage
                .from(BUCKET)
                .getPublicUrl(`${CARPETA}/${archivo.name}`);
            const mimeType = obtenerMimeType(archivo);

            return {
                nombre: archivo.name,
                tipo: obtenerTipoArchivo(archivo),
                mimeType,
                url: urlData.publicUrl
            };
        });

        registrarLog('storage.list.success', {
            total: resultado.length,
            videos: resultado.filter(archivo => archivo.tipo === 'VIDEO').length,
            imagenes: resultado.filter(archivo => archivo.tipo === 'IMAGEN').length,
            nombres: resultado.map(archivo => archivo.nombre)
        });

        return resultado;

    } catch (error) {
        console.error('Error obteniendo archivos de Supabase:', error);
        registrarLog('storage.list.error', {
            message: error instanceof Error ? error.message : String(error)
        });
        return [];
    }
}

// Crear elementos HTML del carrusel
function crearCarrusel(archivos) {
    const contenedor = document.getElementById('form-carrusel');

    if (!contenedor) {
        console.error('No se encontró el contenedor #form-carrusel');
        return;
    }

    contenedor.innerHTML = '';

    registrarLog('carousel.create', {
        entornoTV: ES_ENTORNO_TV,
        total: archivos.length,
        archivos: archivos.map(archivo => ({
            nombre: archivo.nombre,
            tipo: archivo.tipo,
            mimeType: archivo.mimeType
        }))
    });

    archivos.forEach((archivo, indice) => {
        const slide = document.createElement('div');

        slide.classList.add('fade-carousel');

        slide.dataset.indice = indice;
        slide.dataset.tipo = archivo.tipo;

        let elementoMedia;

        if (archivo.tipo === 'VIDEO') {
            const video = document.createElement('video');
            const canvas = ES_ENTORNO_TV
                ? document.createElement('canvas')
                : null;
            const contexto = canvas?.getContext('2d') || null;

            // El autoplay se activa únicamente después de pulsar el botón de
            // inicio. Así el navegador de la TV recibe una interacción válida.
            video.autoplay = false;
            video.muted = true;
            video.defaultMuted = true;
            video.volume = 0;
            video.controls = false;
            video.playsInline = true;
            video.preload = 'metadata';
            video.crossOrigin = canvas ? 'anonymous' : '';
            video.disablePictureInPicture = true;
            video.disableRemotePlayback = true;
            video.tabIndex = -1;
            video.setAttribute('muted', '');
            video.setAttribute('playsinline', '');
            video.setAttribute('webkit-playsinline', '');
            video.setAttribute('disablepictureinpicture', '');
            video.setAttribute('disableremoteplayback', '');
            video.setAttribute(
                'controlslist',
                'nodownload nofullscreen noremoteplayback noplaybackrate'
            );
            video.setAttribute('aria-hidden', 'true');
            video.dataset.videoSource = archivo.nombre;
            video.src = archivo.url;

            videosPorSlide.set(slide, video);

            const dibujarFotograma = () => {
                if (!canvas || !contexto || video.paused || video.ended) {
                    return;
                }

                if (
                    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
                    canvas.width > 0 &&
                    canvas.height > 0
                ) {
                    try {
                        contexto.drawImage(
                            video,
                            0,
                            0,
                            canvas.width,
                            canvas.height
                        );
                    } catch (error) {
                        console.error(
                            'No se pudo dibujar el video para TV:',
                            archivo.nombre,
                            error
                        );
                        detenerAnimacionVideo(video);
                        return;
                    }
                }

                animacionesVideo.set(
                    video,
                    requestAnimationFrame(dibujarFotograma)
                );
            };

            video.addEventListener('loadedmetadata', () => {
                registrarLog('video.loadedmetadata', {
                    nombre: archivo.nombre,
                    duracion: video.duration,
                    ancho: video.videoWidth,
                    alto: video.videoHeight,
                    readyState: video.readyState
                });

                if (canvas) {
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                }
            });

            if (canvas) {
                video.addEventListener('playing', dibujarFotograma);
                video.addEventListener('loadeddata', () => {
                    if (!video.paused && !video.ended) {
                        dibujarFotograma();
                    }
                });
            }

            video.addEventListener('playing', () => {
                registrarLog('video.playing', {
                    nombre: archivo.nombre,
                    indice,
                    duracion: video.duration,
                    currentTime: video.currentTime,
                    readyState: video.readyState,
                    entornoTV: ES_ENTORNO_TV
                });
                programarFinVideo(video, slide);
            });
            video.addEventListener('pause', () => {
                registrarLog('video.pause', {
                    nombre: archivo.nombre,
                    indice,
                    currentTime: video.currentTime,
                    ended: video.ended
                });
                detenerAnimacionVideo(video);
                limpiarTemporizadorFinVideo(video);
            });
            video.addEventListener('canplay', () => {
                registrarLog('video.canplay', {
                    nombre: archivo.nombre,
                    indice,
                    readyState: video.readyState,
                    carruselIniciado,
                    slideActivo: slide.classList.contains('active')
                });

                if (carruselIniciado && slide.classList.contains('active')) {
                    intentarReproducirVideo(video);
                }
            });

            // Avanzar cuando termine el video
            video.addEventListener('ended', () => {
                registrarLog('video.ended', {
                    nombre: archivo.nombre,
                    indice,
                    currentTime: video.currentTime,
                    duracion: video.duration,
                    slideActivo: slide.classList.contains('active')
                });
                avanzarAlFinalDelVideo(video, slide);
            });

            // Si ocurre un error de reproducción, avanzar
            video.addEventListener('error', () => {
                console.error('Error cargando video:', archivo.nombre);
                registrarLog('video.error', {
                    nombre: archivo.nombre,
                    indice,
                    currentTime: video.currentTime,
                    duracion: video.duration,
                    readyState: video.readyState,
                    networkState: video.networkState,
                    mediaError: video.error
                        ? {
                            code: video.error.code,
                            message: video.error.message
                        }
                        : null
                });
                void sincronizarLogsTxt();

                const botonInicio = document.getElementById('boton-inicio');

                if (slide.classList.contains('active')) {
                    if (botonInicio) {
                        botonInicio.hidden = false;
                        botonInicio.focus({ preventScroll: true });
                    }

                    siguienteElemento();
                }
            });

            video.load();
            elementoMedia = canvas || video;
            elementoMedia.dataset.videoSource = archivo.nombre;

        } else {
            elementoMedia = document.createElement('img');

            elementoMedia.src = archivo.url;
            elementoMedia.alt = 'Imagen del carrusel';
        }

        elementoMedia.classList.add('fade-image');

        elementoMedia.style.transform =
            `translate(-50%, -50%) ${ROTACION}`;

        slide.appendChild(elementoMedia);
        contenedor.appendChild(slide);
    });

    elementosCarrusel = Array.from(
        contenedor.querySelectorAll('.fade-carousel')
    );
}

function obtenerVideoDeSlide(slide) {
    if (!slide) {
        return null;
    }

    return videosPorSlide.get(slide) || slide.querySelector('video');
}

function detenerAnimacionVideo(video) {
    const frame = animacionesVideo.get(video);

    if (frame) {
        cancelAnimationFrame(frame);
        animacionesVideo.delete(video);
    }
}

function limpiarTemporizadorFinVideo(video) {
    const temporizador = temporizadoresFinVideo.get(video);

    if (temporizador) {
        clearTimeout(temporizador);
        temporizadoresFinVideo.delete(video);
    }
}

// Algunos navegadores de Smart TV pueden emitir `ended` antes de actualizar
// completamente el tiempo actual. Se valida la duración real antes de cambiar
// de slide y se deja un temporizador de respaldo para completar el video.
function programarFinVideo(video, slide) {
    limpiarTemporizadorFinVideo(video);

    const duracion = video.duration;

    if (!Number.isFinite(duracion) || duracion <= 0) {
        return;
    }

    const segundosRestantes = Math.max(
        0.25,
        duracion - video.currentTime + 0.15
    );

    const temporizador = setTimeout(() => {
        avanzarAlFinalDelVideo(video, slide);
    }, segundosRestantes * 1000);

    temporizadoresFinVideo.set(video, temporizador);
}

function avanzarAlFinalDelVideo(video, slide) {
    if (!carruselIniciado || !slide.classList.contains('active')) {
        registrarLog('video.advance.ignored', {
            indice: indiceActual,
            carruselIniciado,
            slideActivo: slide.classList.contains('active'),
            currentTime: video.currentTime,
            duracion: video.duration
        });
        return;
    }

    const duracion = video.duration;
    const segundosRestantes = duracion - video.currentTime;

    // No se avanza si el evento llegó antes de que el video termine.
    if (Number.isFinite(duracion) && segundosRestantes > 0.25) {
        registrarLog('video.advance.delayed', {
            indice: indiceActual,
            currentTime: video.currentTime,
            duracion,
            segundosRestantes
        });
        programarFinVideo(video, slide);
        return;
    }

    limpiarTemporizadorFinVideo(video);
    registrarLog('video.advance.allowed', {
        indiceActual,
        currentTime: video.currentTime,
        duracion
    });
    siguienteElemento();
}

// Reproducir siempre en silencio. Los reintentos son automáticos para evitar
// depender de una pulsación en la pantalla de la TV.
function intentarReproducirVideo(video) {
    const videoActual = obtenerVideoDeSlide(elementosCarrusel[indiceActual]);

    if (!carruselIniciado || videoActual !== video || !video.paused || video.ended) {
        registrarLog('video.play.skipped', {
            motivo: !carruselIniciado
                ? 'carrusel-no-iniciado'
                : videoActual !== video
                    ? 'video-no-activo'
                    : !video.paused
                        ? 'ya-reproduciendo'
                        : 'video-terminado',
            indice: indiceActual,
            paused: video?.paused,
            ended: video?.ended
        });
        return;
    }

    video.muted = true;
    video.defaultMuted = true;
    video.volume = 0;
    video.autoplay = true;
    video.setAttribute('autoplay', '');

    registrarLog('video.play.intent', {
        nombre: video.dataset.videoSource || video.currentSrc || video.src,
        indice: indiceActual,
        paused: video.paused,
        muted: video.muted,
        volume: video.volume,
        userActivation: navigator.userActivation
            ? navigator.userActivation.isActive
            : null,
        entornoTV: ES_ENTORNO_TV
    });

    const reproduccion = video.play();

    if (!reproduccion || typeof reproduccion.catch !== 'function') {
        registrarLog('video.play.no-promise', {
            indice: indiceActual
        });
        return;
    }

    reproduccion.then(() => {
        registrarLog('video.play.resolved', {
            indice: indiceActual,
            paused: video.paused,
            currentTime: video.currentTime,
            userActivation: navigator.userActivation
                ? navigator.userActivation.isActive
                : null
        });
    });

    reproduccion.catch(error => {
        registrarLog('video.play.rejected', {
            indice: indiceActual,
            name: error.name,
            message: error.message,
            paused: video.paused,
            ended: video.ended,
            userActivation: navigator.userActivation
                ? navigator.userActivation.isActive
                : null
        });
        void sincronizarLogsTxt();

        if (videoActual !== obtenerVideoDeSlide(elementosCarrusel[indiceActual])) {
            return;
        }

        // AbortError aparece normalmente al cambiar de slide y no requiere
        // reintento. NotAllowedError se reintenta sin mostrar controles.
        if (error.name !== 'AbortError') {
            const botonInicio = document.getElementById('boton-inicio');

            if (botonInicio && error.name === 'NotAllowedError') {
                // Browser puede exigir el gesto cuando entra el primer video,
                // especialmente si el carrusel comenzó mostrando una imagen.
                botonInicio.hidden = false;
                botonInicio.focus({ preventScroll: true });
            }

            if (error.name !== 'NotAllowedError') {
                console.error('Error reproduciendo video:', error);
            }

            const reintentoAnterior = reintentosVideo.get(video);

            if (reintentoAnterior) {
                clearTimeout(reintentoAnterior);
            }

            const reintento = setTimeout(() => {
                reintentosVideo.delete(video);
                intentarReproducirVideo(video);
            }, 1000);

            reintentosVideo.set(video, reintento);
        }
    });
}

// Mostrar elemento actual
function mostrarElemento(indice) {
    if (elementosCarrusel.length === 0) {
        registrarLog('carousel.show.skipped', {
            motivo: 'sin-elementos',
            indice
        });
        return;
    }

    clearTimeout(timeoutCarrusel);

    // Ocultar todos los elementos y detener videos
    elementosCarrusel.forEach(slide => {
        slide.classList.remove('active');

        const video = obtenerVideoDeSlide(slide);

        if (video) {
            limpiarTemporizadorFinVideo(video);

            const reintento = reintentosVideo.get(video);

            if (reintento) {
                clearTimeout(reintento);
                reintentosVideo.delete(video);
            }

            video.pause();
            video.currentTime = 0;
            video.autoplay = false;
            video.removeAttribute('autoplay');
        }
    });

    indiceActual = indice;

    const slideActual = elementosCarrusel[indiceActual];
    const videoActual = obtenerVideoDeSlide(slideActual);

    slideActual.classList.add('active');

    registrarLog('carousel.show', {
        indice: indiceActual,
        tipo: slideActual.dataset.tipo,
        video: Boolean(videoActual),
        carruselIniciado,
        nombre: videoActual?.dataset.videoSource || videoActual?.src || null
    });

    if (!carruselIniciado) {
        return;
    }

    const video = obtenerVideoDeSlide(slideActual);

    if (video) {
        intentarReproducirVideo(video);

    } else if (slideActual.dataset.tipo !== 'VIDEO') {
        timeoutCarrusel = setTimeout(() => {
            siguienteElemento();
        }, DURACION_IMAGEN);
    }
}

// La primera pulsación desbloquea el autoplay del navegador de la TV. Luego
// el carrusel avanza por todos los elementos y vuelve al primero sin más
// interacción.
function iniciarCarrusel() {
    const botonInicio = document.getElementById('boton-inicio');
    const ahora = Date.now();

    registrarLog('carousel.start.request', {
        indice: indiceActual,
        carruselIniciado,
        botonOculto: botonInicio?.hidden,
        activo: document.activeElement
            ? describirElemento(document.activeElement)
            : null
    });

    // Un mando puede generar keydown + click para la misma pulsación.
    // Evitamos reiniciar el video dos veces por una única orden.
    if (ahora - ultimaInteraccionInicio < 400) {
        return;
    }

    ultimaInteraccionInicio = ahora;

    if (
        (carruselIniciado && botonInicio?.hidden !== false) ||
        elementosCarrusel.length === 0
    ) {
        registrarLog('carousel.start.ignored', {
            motivo: elementosCarrusel.length === 0
                ? 'sin-elementos'
                : 'ya-iniciado-y-boton-oculto'
        });
        return;
    }

    carruselIniciado = true;

    const videoActual = obtenerVideoDeSlide(elementosCarrusel[indiceActual]);

    if (videoActual) {
        // Ocultar el botón solamente cuando el navegador confirma que el video
        // comenzó. Si play() es rechazado, queda disponible para reintentar.
        videoActual.addEventListener(
            'playing',
            () => {
                if (botonInicio) {
                    botonInicio.hidden = true;
                }
            },
            { once: true }
        );
    } else if (botonInicio) {
        // Las imágenes no necesitan desbloqueo de autoplay.
        botonInicio.hidden = true;
    }

    mostrarElemento(indiceActual);

    registrarLog('carousel.start.accepted', {
        indice: indiceActual,
        video: Boolean(videoActual),
        botonOculto: botonInicio?.hidden
    });
}

function manejarInteraccionInicio(evento) {
    registrarLog('start-button.interaction', {
        tipo: evento.type,
        key: evento.key,
        code: evento.code,
        keyCode: evento.keyCode,
        isTrusted: evento.isTrusted,
        target: describirElemento(evento.target),
        defaultPreventedAntes: evento.defaultPrevented
    });

    if (evento.type === 'keydown') {
        const teclasInicio = new Set([
            'Enter',
            ' ',
            'Select',
            'Accept',
            'OK'
        ]);

        const esDpadCentral = [13, 23, 66].includes(evento.keyCode);

        if (!teclasInicio.has(evento.key) && !esDpadCentral) {
            return;
        }
    }

    // El gesto se procesa en pointerdown/keydown para que Browser lo asocie
    // directamente con video.play(), incluso usando el control remoto.
    evento.preventDefault();
    evento.stopPropagation();
    iniciarCarrusel();
}

// Pasar al siguiente elemento
function siguienteElemento() {
    if (elementosCarrusel.length === 0) {
        registrarLog('carousel.next.skipped', {
            motivo: 'sin-elementos'
        });
        return;
    }

    const siguienteIndice =
        (indiceActual + 1) % elementosCarrusel.length;

    registrarLog('carousel.next', {
        anterior: indiceActual,
        siguiente: siguienteIndice,
        total: elementosCarrusel.length
    });

    mostrarElemento(siguienteIndice);
}

// Inicializar carrusel
async function inicializarCarrusel() {
    const archivos = await obtenerArchivos();

    if (archivos.length === 0) {
        console.warn('No hay archivos disponibles para el carrusel.');

        const botonInicio = document.getElementById('boton-inicio');

        if (botonInicio) {
            botonInicio.hidden = true;
        }

        return;
    }

    crearCarrusel(archivos);

    // Mostrar el primer elemento, pero esperar el toque inicial para empezar
    // a reproducir medios o avanzar automáticamente.
    mostrarElemento(0);

    const botonInicio = document.getElementById('boton-inicio');
    botonInicio?.focus({ preventScroll: true });
}

// Ejecutar cuando cargue el DOM
document.addEventListener('DOMContentLoaded', () => {
    crearPanelDiagnostico();
    instalarCapturaDeInteracciones();
    registrarLog('app.start', {
        debug: DEBUG_ACTIVO,
        entornoTV: ES_ENTORNO_TV,
        userAgent: navigator.userAgent,
        idioma: navigator.language,
        pantalla: {
            ancho: window.screen?.width,
            alto: window.screen?.height,
            pixelRatio: window.devicePixelRatio
        },
        viewport: {
            ancho: window.innerWidth,
            alto: window.innerHeight
        },
        online: navigator.onLine,
        userActivation: navigator.userActivation
            ? navigator.userActivation.isActive
            : null
    });

    const botonInicio = document.getElementById('boton-inicio');

    botonInicio?.addEventListener('pointerdown', manejarInteraccionInicio);
    botonInicio?.addEventListener('keydown', manejarInteraccionInicio);
    botonInicio?.addEventListener('click', iniciarCarrusel);
    inicializarCarrusel();
});

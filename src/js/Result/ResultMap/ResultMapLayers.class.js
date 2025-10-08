import { Tile as TileLayer } from 'ol/layer';
import { StadiaMaps, OSM, TileWMS } from 'ol/source';
import XYZ from 'ol/source/XYZ';

export default class ResultMapLayers {
    constructor(sqs) {
        this.sqs = sqs;
        this.layers = [];
        this.metaDataLoaded = false;
        this.metaDataLoadPromises = [];


        //The "title" property in the metadata of some layers (just SGU for now) is not enough on its own to explain the layer
        //so we add some information to them here via this mapping which "translates" the "name" property to something more human readable which can be prepended to the layer title
        this.layerTranslations = [];
        this.layerTranslations.push({
            search: /^strand:SE\.GOV\.SGU\.STRANDFORSKJUTNINGSMODELL\..*$/,
            replace: "Coastal displacement",
        })

        //jord:SE.GOV.SGU.JORD.GRUNDLAGER.GENOMSLAPPLIGHET.25K
        this.layerTranslations.push({
            search: /^jord:SE\.GOV\.SGU\.JORD\.GRUNDLAGER\.GENOMSLAPPLIGHET.*$/,
            replace: "Soil permeability",
        })

        //marin:SE.GOV.SGU.MARIN.SONARTACKNING.100K
        this.layerTranslations.push({
            search: /^marin:SE\.GOV\.SGU\.MARIN\.SONARTACKNING\.100K$/,
            replace: "100K",
        });

        //marin:SE.GOV.SGU.MARIN.SONARTACKNING.500K
        this.layerTranslations.push({
            search: /^marin:SE\.GOV\.SGU\.MARIN\.SONARTACKNING\.500K$/,
            replace: "500K",
        });


        this.sguKeepList = [
                "strandforskjmodell_bp100_vy",
                "strandforskjmodell_bp200_vy",
                "strandforskjmodell_bp300_vy",
                "strandforskjmodell_bp400_vy",
                "strandforskjmodell_bp500_vy",
                "strandforskjmodell_bp600_vy",
                "strandforskjmodell_bp700_vy",
                "strandforskjmodell_bp800_vy",
                "strandforskjmodell_bp900_vy",
                "strandforskjmodell_bp1000_vy",
                "strandforskjmodell_bp1200_vy",
                "strandforskjmodell_bp1300_vy",
                "strandforskjmodell_bp1400_vy",
                "strandforskjmodell_bp1500_vy",
                "strandforskjmodell_bp1600_vy",
                "strandforskjmodell_bp1700_vy",
                "strandforskjmodell_bp1800_vy",
                "strandforskjmodell_bp1900_vy",
                "strandforskjmodell_bp2000_vy",
                "strandforskjmodell_bp2100_vy",
                "strandforskjmodell_bp2200_vy",
                "strandforskjmodell_bp2300_vy",
                "strandforskjmodell_bp2400_vy",
                "strandforskjmodell_bp2500_vy",
                "strandforskjmodell_bp2600_vy",
                "strandforskjmodell_bp2700_vy",
                "strandforskjmodell_bp2800_vy",
                "strandforskjmodell_bp2900_vy",
                "strandforskjmodell_bp3000_vy",
                "strandforskjmodell_bp3100_vy",
                "strandforskjmodell_bp3200_vy",
                "strandforskjmodell_bp3300_vy",
                "strandforskjmodell_bp3400_vy",
                "strandforskjmodell_bp3500_vy",
                "strandforskjmodell_bp3600_vy",
                "strandforskjmodell_bp3700_vy",
                "strandforskjmodell_bp3800_vy",
                "strandforskjmodell_bp3900_vy",
                "strandforskjmodell_bp4000_vy",
                "strandforskjmodell_bp4100_vy",
                "strandforskjmodell_bp4200_vy",
                "strandforskjmodell_bp4300_vy",
                "strandforskjmodell_bp4400_vy",
                "strandforskjmodell_bp4500_vy",
                "strandforskjmodell_bp4600_vy",
                "strandforskjmodell_bp4700_vy",
                "strandforskjmodell_bp4800_vy",
                "strandforskjmodell_bp4900_vy",
                "strandforskjmodell_bp5000_vy",
                "strandforskjmodell_bp5100_vy",
                "strandforskjmodell_bp5200_vy",
                "strandforskjmodell_bp5300_vy",
                "strandforskjmodell_bp5400_vy",
                "strandforskjmodell_bp5500_vy",
                "strandforskjmodell_bp5600_vy",
                "strandforskjmodell_bp5700_vy",
                "strandforskjmodell_bp5800_vy",
                "strandforskjmodell_bp5900_vy",
                "strandforskjmodell_bp6000_vy",
                "strandforskjmodell_bp6100_vy",
                "strandforskjmodell_bp6200_vy",
                "strandforskjmodell_bp6300_vy",
                "strandforskjmodell_bp6400_vy",
                "strandforskjmodell_bp6500_vy",
                "strandforskjmodell_bp6600_vy",
                "strandforskjmodell_bp6700_vy",
                "strandforskjmodell_bp6800_vy",
                "strandforskjmodell_bp6900_vy",
                "strandforskjmodell_bp7000_vy",
                "strandforskjmodell_bp7100_vy",
                "strandforskjmodell_bp7200_vy",
                "strandforskjmodell_bp7300_vy",
                "strandforskjmodell_bp7400_vy",
                "strandforskjmodell_bp7500_vy",
                "strandforskjmodell_bp7600_vy",
                "strandforskjmodell_bp7700_vy",
                "strandforskjmodell_bp7800_vy",
                "strandforskjmodell_bp7900_vy",
                "strandforskjmodell_bp8000_vy",
                "strandforskjmodell_bp8100_vy",
                "strandforskjmodell_bp8200_vy",
                "strandforskjmodell_bp8300_vy",
                "strandforskjmodell_bp8400_vy",
                "strandforskjmodell_bp8500_vy",
                "strandforskjmodell_bp8600_vy",
                "strandforskjmodell_bp8700_vy",
                "strandforskjmodell_bp8800_vy",
                "strandforskjmodell_bp8900_vy",
                "strandforskjmodell_bp9000_vy",
                "strandforskjmodell_bp9100_vy",
                "strandforskjmodell_bp9200_vy",
                "strandforskjmodell_bp9300_vy",
                "strandforskjmodell_bp9400_vy",
                "strandforskjmodell_bp9500_vy",
                "strandforskjmodell_bp9600_vy",
                "strandforskjmodell_bp9700_vy",
                "strandforskjmodell_bp9800_vy",
                "strandforskjmodell_bp9900_vy",
                "strandforskjmodell_bp10000_vy",
                "strandforskjmodell_bp10100_vy",
                "strandforskjmodell_bp10200_vy",
                "strandforskjmodell_bp10300_vy",
                "strandforskjmodell_bp10400_vy",
                "strandforskjmodell_bp10500_vy",
                "strandforskjmodell_bp10600_vy",
                "strandforskjmodell_bp10700_vy",
                "strandforskjmodell_bp10800_vy",
                "strandforskjmodell_bp10900_vy",
                "strandforskjmodell_bp11000_vy",
                "strandforskjmodell_bp11100_vy",
                "strandforskjmodell_bp11200_vy",
                "strandforskjmodell_bp11300_vy",
                "strandforskjmodell_bp11400_vy",
                "strandforskjmodell_bp11500_vy",
                "strandforskjmodell_bp11600_vy",
                "strandforskjmodell_bp11700_vy",
                "strandforskjmodell_bp11800_vy",
                "strandforskjmodell_bp11900_vy",
                "strandforskjmodell_bp12000_vy",
                "strandforskjmodell_bp12100_vy",
                "strandforskjmodell_bp12200_vy",
                "strandforskjmodell_bp12300_vy",
                "strandforskjmodell_bp12400_vy",
                "strandforskjmodell_bp12500_vy",
                "strandforskjmodell_bp12600_vy",
                "strandforskjmodell_bp12700_vy",
                "strandforskjmodell_bp12800_vy",
                "strandforskjmodell_bp12900_vy",
                "strandforskjmodell_bp13000_vy",
                "strandforskjmodell_bp13100_vy",
                "strandforskjmodell_bp13200_vy",
                "strandforskjmodell_bp13300_vy",
                "strandforskjmodell_bp13400_vy",
                "strandforskjmodell_bp13500_vy",
                "bekv_kartform_vy",
                "bekv_bkvv_vy",
                "stre_erof_prognos_vy",
                "stre_eros_index_vy_v2",
                "stre_eros_skydd_vy",
                "stre_eros_skydd_v2_vy",
                "landform_poly_fluvial_vy",
                "v_er_fossil_fuel_resource",
                "v_geologicunit_surficial_25_100_poly",
                "v_geologicunit_surficial_25_100_point",
                "v_geologicunit_surficial_750_poly",
                "jkar_abcdg_jg2_genomslapp_vy",
                "plan_undersokningsomrade_geofysik_vy",
                "plan_undersokningsomrade_geokemi_vy",
                "stre_nnh_moh_1_vy_v2",
                "stre_nnh_moh_15_vy",
                "stre_nnh_moh_15_vy_v2",
                "stre_nnh_moh_2_vy",
                "stre_nnh_moh_2_vy_v2",
                "stre_nnh_moh_3_vy",
                "stre_nnh_moh_3_vy_v2",
                "skugga",
                "genomslapplighet_berg",
                "malo_sont_vy",
                "mare_sont_vy",
                "bark_brunnar_icke_energi_vy",
                "malm_malmer_ferrous_metals_vy",
                "jkar_abcdg_jg2_stre_vy",
                "jdjupmod_und_djup_min_vy",
                "blab_kemi_ree_y_tot_vy",
                "mark_moran_salpeter_icpms_sr_vy",
                "bmod_struktur_textursymbol_vy",
                "made_matl_vy"
            ];
    }

    async fetchWfsFeatureTypes(baseUrl, options = {}) {
		const defaultOptions = {
			version: '2.0.0',
			sortByName: true
		};
		const config = { ...defaultOptions, ...options };

		try {
			const capabilitiesUrl = `${baseUrl}?SERVICE=WFS&REQUEST=GetCapabilities&VERSION=${config.version}`;
			console.log(`Fetching WFS capabilities from: ${capabilitiesUrl}`);

			const response = await fetch(capabilitiesUrl);
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}
			const xmlText = await response.text();
			const parser = new DOMParser();
			const xmlDoc = parser.parseFromString(xmlText, "text/xml");

			const WFS_NS = xmlDoc.documentElement?.namespaceURI || 'http://www.opengis.net/wfs';

			const featureTypeEls = Array.from(
				xmlDoc.getElementsByTagNameNS?.(WFS_NS, 'FeatureType') || xmlDoc.getElementsByTagName('FeatureType')
			);

			const featureTypes = featureTypeEls.map(ftEl => {
				const nameEl = ftEl.getElementsByTagNameNS?.(WFS_NS, 'Name')[0] || ftEl.getElementsByTagName('Name')[0];
				const titleEl = ftEl.getElementsByTagNameNS?.(WFS_NS, 'Title')[0] || ftEl.getElementsByTagName('Title')[0];
				const abstractEl = ftEl.getElementsByTagNameNS?.(WFS_NS, 'Abstract')[0] || ftEl.getElementsByTagName('Abstract')[0];
				return {
					name: nameEl ? nameEl.textContent.trim() : '',
					title: titleEl ? titleEl.textContent.trim() : '',
					abstract: abstractEl ? abstractEl.textContent.trim() : ''
				};
			});

			if (config.sortByName) {
				featureTypes.sort((a, b) => a.title.localeCompare(b.title, 'sv'));
			}

			console.log(`Parsed ${featureTypes.length} WFS feature types`);
			return featureTypes;

		} catch (error) {
			console.error(`Failed to fetch WFS capabilities from ${baseUrl}:`, error);
			throw error;
		}
	}

	
    async fetchWmsLayerInfo(baseUrl, options = {}) {
        const defaultOptions = {
            version: '1.3.0',
            filterNumericNames: false,
            sortByName: true
        };
        
        const config = { ...defaultOptions, ...options };
        
        try {
            // Construct capabilities URL
            const capabilitiesUrl = `${baseUrl}?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=${config.version}`;
            
            // Fetch capabilities
            const response = await fetch(capabilitiesUrl);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const xmlText = await response.text();
            
            // Parse the XML
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, "text/xml");
            
            // Check for XML parsing errors
            const parserError = xmlDoc.querySelector('parsererror');
            if (parserError) {
                throw new Error(`XML parsing error: ${parserError.textContent}`);
            }
            
            // Extract layer information - now returns flat array directly
            const layers = this.parseWmsCapabilities(xmlDoc, config);
            
            //console.log(`Successfully parsed ${layers.length} layers from WMS service`);
            return layers;
            
        } catch (error) {
            console.error(`Failed to fetch WMS capabilities from ${baseUrl}:`, error);
            throw error;
        }
    }

	parseWmsCapabilities(
        xmlDoc,
        {
            filterNumericNames = false,
            sortByName = true,
            fallbackIfEmpty = true,
        } = {}
        ) {
        const WMS_NS = xmlDoc.documentElement?.namespaceURI || 'http://www.opengis.net/wms';
        const XLINK_NS = 'http://www.w3.org/1999/xlink';

        // Descendant helpers (useful for lists like all <Layer/> in the doc)
        const q = (el, tag) =>
            (el.getElementsByTagNameNS?.(WMS_NS, tag)[0] ||
            el.getElementsByTagName?.(tag)?.[0]) || null;

        const qAll = (el, tag) =>
            Array.from(
            el.getElementsByTagNameNS?.(WMS_NS, tag) ||
            el.getElementsByTagName?.(tag) ||
            []
            );

        // NEW: direct child helpers — prevent accidental capture from nested layers
        const qChild = (el, tag) => {
            const kids = el.children ? Array.from(el.children) : [];
            return kids.find(
            (n) => n.localName === tag && (n.namespaceURI === WMS_NS || !n.namespaceURI)
            ) || null;
        };

        const qChildren = (el, tag) => {
            const kids = el.children ? Array.from(el.children) : [];
            return kids.filter(
            (n) => n.localName === tag && (n.namespaceURI === WMS_NS || !n.namespaceURI)
            );
        };

        // Legend URL under the given element (Layer or Style) — descendant search is fine here
        const getLegendUrl = (el) => {
            const legendEls = qChildren(el, 'LegendURL').length ? qChildren(el, 'LegendURL') : qAll(el, 'LegendURL');
            for (const legendEl of legendEls) {
            // OnlineResource can be in WMS namespace or none; check both
            const online =
                (legendEl.getElementsByTagName?.('OnlineResource') || [])[0] ||
                (legendEl.getElementsByTagNameNS?.(WMS_NS, 'OnlineResource') || [])[0] ||
                qChild(legendEl, 'OnlineResource');

            if (!online) continue;

            const href = online.getAttributeNS
                ? (online.getAttributeNS(XLINK_NS, 'href') || online.getAttribute('href'))
                : (online.getAttribute?.('xlink:href') || online.getAttribute?.('href'));

            if (href) return href;
            }
            return null;
        };

        // Styles array; first style is conventionally the default in GeoServer
        const getStyles = (layerEl) => {
            const styleEls = qChildren(layerEl, 'Style').length ? qChildren(layerEl, 'Style') : qAll(layerEl, 'Style');
            return styleEls.map((styleEl) => {
            const name = (qChild(styleEl, 'Name')?.textContent || q(styleEl, 'Name')?.textContent || '').trim();
            const title = (qChild(styleEl, 'Title')?.textContent || q(styleEl, 'Title')?.textContent || name).trim();
            const abstract = (qChild(styleEl, 'Abstract')?.textContent || q(styleEl, 'Abstract')?.textContent || '').trim();
            return { name, title, abstract, legendUrl: getLegendUrl(styleEl) };
            });
        };

        const getScale = (layerEl, tag) => {
            // Only take scale from the layer itself (not nested)
            const el = qChild(layerEl, tag);
            const val = el ? parseFloat(el.textContent.trim()) : NaN;
            return Number.isFinite(val) ? val : null;
        };

        const getCrsList = (layerEl) =>
            qChildren(layerEl, 'CRS').map((n) => n.textContent.trim());

        // Convert OGC ScaleDenominator → OL resolution (m/px). 0.28 mm px size per spec.
        const scaleToResolution = (scaleDenom) =>
            Number.isFinite(scaleDenom) ? scaleDenom * 0.00028 : null;

        // Find all <Layer> elements (descendant search is desired here)
        const allLayerEls = qAll(xmlDoc, 'Layer');

        // Create flat list of layers
        const layers = [];

        allLayerEls.forEach((layerEl) => {
            // Only look at direct children here — prevents duplicate names from nested layers
            const nameEl = qChild(layerEl, 'Name');
            const titleEl = qChild(layerEl, 'Title');

            // Skip layers without names (these are typically group/container layers)
            if (!nameEl) return;

            const name = nameEl.textContent.trim();

            // Only include queryable layers (common pattern to skip group layers)
            const queryable = /^(1|true)$/i.test(layerEl.getAttribute('queryable') || '');
            if (!queryable) return;

            const title = (titleEl?.textContent || name || '').trim();
            const abstract = (qChild(layerEl, 'Abstract')?.textContent || '').trim();

            const styles = getStyles(layerEl);
            const defaultStyle = styles[0]?.name || '';
            const legendUrl = styles[0]?.legendUrl || getLegendUrl(layerEl) || null;

            const minScaleDenominator = getScale(layerEl, 'MinScaleDenominator');
            const maxScaleDenominator = getScale(layerEl, 'MaxScaleDenominator');

            layers.push({
                id: name,
                name,
                title,
                abstract,
                queryable,
                styles,
                defaultStyle,
                legendUrl,
                crsList: getCrsList(layerEl),
                minScaleDenominator,
                maxScaleDenominator,
                // Convenience for OL visibility:
                // Note: MaxScale → minResolution, MinScale → maxResolution
                minResolution: scaleToResolution(maxScaleDenominator) ?? null,
                maxResolution: scaleToResolution(minScaleDenominator) ?? null,
            });
        });

        // Filter layers
        let filteredLayers = layers;

        if (filterNumericNames) {
            const onlyNumeric = layers.filter((l) => /^\d+$/.test(l.name));
            filteredLayers = onlyNumeric.length || !fallbackIfEmpty ? onlyNumeric : layers;
        }

        if (sortByName) {
            const allNumeric =
            filteredLayers.length > 0 && filteredLayers.every((l) => /^\d+$/.test(l.name));
            filteredLayers.sort(
            allNumeric
                ? (a, b) => Number(a.name) - Number(b.name)
                : (a, b) => a.name.localeCompare(b.name, 'sv')
            );
        }

        return filteredLayers;
    }


    initBaseLayers() {
        let layers = [];
        //Define base layers
        let stamenLayer = new TileLayer({
            source: new StadiaMaps({
                layer: 'stamen_terrain_background',
                wrapX: true,
                url: "https://tiles-eu.stadiamaps.com/tiles/stamen_terrain_background/{z}/{x}/{y}.png",
                attributions: ['&copy; <a href="https://www.stadiamaps.com/" target="_blank">Stadia Maps</a>', 
                    '&copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a>',
                    '&copy; <a href="https://www.openstreetmap.org/about/" target="_blank">OpenStreetMap contributors</a>',
                    '&copy; <a href="https://stamen.com/" target="_blank">Stamen Design</a>'],
            }),
            visible: true
        });
        stamenLayer.setProperties({
            "layerId": "stamen",
            "title": "Terrain",
            "type": "baseLayer"
        });
        stamenLayer.setZIndex(1);
        layers.push(stamenLayer);

        let stamenTerrainLabelsLayer = new TileLayer({
            source: new StadiaMaps({
                layer: 'stamen_terrain',
                wrapX: true,
                url: "https://tiles-eu.stadiamaps.com/tiles/stamen_terrain/{z}/{x}/{y}.png",
                attributions: [
                    '&copy; <a href="https://www.stadiamaps.com/" target="_blank">Stadia Maps</a>',
                    '&copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a>',
                    '&copy; <a href="https://www.openstreetmap.org/about/" target="_blank">OpenStreetMap contributors</a>',
                    '&copy; <a href="https://stamen.com/" target="_blank">Stamen Design</a>'
                ],
            }),
            visible: false
        });
        stamenTerrainLabelsLayer.setProperties({
            "layerId": "stamenTerrain",
            "title": "Terrain (Labels & Lines)",
            "type": "baseLayer"
        });
        stamenTerrainLabelsLayer.setZIndex(1);
        layers.push(stamenTerrainLabelsLayer);

        let osmLayer = new TileLayer({
            source: new OSM({
                attributions: [
                    '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap contributors</a>'
                ]
            }),
            visible: false
        });
        osmLayer.setProperties({
            "layerId": "osm",
            "title": "OpenStreetMap",
            "type": "baseLayer"
        });
        osmLayer.setZIndex(1);
        layers.push(osmLayer);

        let mapboxSatelliteLayer = new TileLayer({
            source: new XYZ({
                url: `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/256/{z}/{x}/{y}?access_token=${Config.mapBoxToken}`,
                attributions: [
                    '© <a href="https://www.mapbox.com/about/maps/">Mapbox</a>',
                    '© <a href="https://www.openstreetmap.org/about/">OpenStreetMap contributors</a>'
                ]
            }),
            visible: false
        });
        mapboxSatelliteLayer.setProperties({
            "layerId": "mapboxSatellite",
            "title": "Mapbox Satellite",
            "type": "baseLayer"
        });
        mapboxSatelliteLayer.setZIndex(1);
        layers.push(mapboxSatelliteLayer);

        let openTopoLayer = new TileLayer({
            source: new XYZ({
                url: 'https://{a-c}.tile.opentopomap.org/{z}/{x}/{y}.png',
                wrapX: true,
                attributions: "Baselayer © <a target='_blank' href='https://www.opentopomap.org/'>OpenTopoMap</a>"
            }),
            visible: false
        });
        openTopoLayer.setProperties({
            "layerId": "topoMap",
            "title": "OpenTopoMap",
            "type": "baseLayer"
        });
        openTopoLayer.setZIndex(1);
        layers.push(openTopoLayer);

        return layers;
    }

    async initAuxLayers() {
        let layers = [];

        let sguUrl = "https://maps3.sgu.se/geoserver/wms";
        let SGULayers = await this.loadWmsLayers(
            sguUrl,
            "SGU",
            {
                filterLayers: (layer) => this.sguKeepList.includes(layer.abstract),
                tiled: false, // SGU works better without tiling
                attributions: [
                    '© <a href="https://www.sgu.se/" target="_blank">Sveriges geologiska undersökning (SGU)</a>',
                    '© <a href="https://www.lantmateriet.se/" target="_blank">Lantmäteriet</a>'
                ]
            }
        );
        layers.push(...SGULayers);

        // Load MSB flooding layers
        let MSBUrl = "https://gisapp.msb.se/arcgis/services/Oversvamningskarteringar/karteringar/MapServer/WmsServer";
        let MSBLayers = await this.loadWmsLayers(
            MSBUrl,
            "MSB flooding",
            {
                attributions: [
                    '© <a href="https://www.msb.se/" target="_blank">MSB</a>'
                ]
            }
        );
        layers.push(...MSBLayers);

        let url = "https://pub.raa.se/visning/uppdrag_v1/wms";
        let uppdragLayers = await this.loadWmsLayers(url, "RAÄ", {
            attributions: [
                '© <a href="https://www.raa.se/" target="_blank">Riksantikvarieämbetet (RAÄ)</a>'
            ]
        });
        layers.push(...uppdragLayers);
        
        let RAABebyggelseLayers = await this.loadWmsLayers("https://pub.raa.se/visning/bebyggelse_kulturhistoriskt_inventerad_v1/wms", "RAÄ", {
            attributions: [
                '© <a href="https://www.raa.se/" target="_blank">Riksantikvarieämbetet (RAÄ)</a>'
            ]
        });
        layers.push(...RAABebyggelseLayers);

        let RAAByggnadsminnenSkyddsomradenLayers = await this.loadWmsLayers("https://pub.raa.se/visning/enskilda_och_statliga_byggnadsminnen_skyddsomraden_v1/wms", "RAÄ", {
            attributions: [
                '© <a href="https://www.raa.se/" target="_blank">Riksantikvarieämbetet (RAÄ)</a>'
            ]
        });
        layers.push(...RAAByggnadsminnenSkyddsomradenLayers);

        let RAABuildingsAndChurchesLayers = await this.loadWmsLayers("https://inspire-raa.metria.se/geoserver/Byggnader/ows", "RAÄ", {
            attributions: [
                '© <a href="https://www.raa.se/" target="_blank">Riksantikvarieämbetet (RAÄ)</a>'
            ]
        });
        layers.push(...RAABuildingsAndChurchesLayers);

        let RAABuildingsRuinsLayers = await this.loadWmsLayers("https://inspire-raa.metria.se/geoserver/ByggnaderRuiner/ows", "RAÄ", {
            attributions: [
                '© <a href="https://www.raa.se/" target="_blank">Riksantikvarieämbetet (RAÄ)</a>'
            ]
        });
        layers.push(...RAABuildingsRuinsLayers);

        let RAAKulturarvLayers = await this.loadWmsLayers("https://inspire-raa.metria.se/geoserver/Kulturarv/ows", "RAÄ", {
            attributions: [
                '© <a href="https://www.raa.se/" target="_blank">Riksantikvarieämbetet (RAÄ)</a>'
            ]
        });
        layers.push(...RAAKulturarvLayers);

        let RAAFornlamningarLayers = await this.loadWmsLayers("https://inspire-raa.metria.se/geoserver/Fornlamningar/ows", "RAÄ", {
            attributions: [
                '© <a href="https://www.raa.se/" target="_blank">Riksantikvarieämbetet (RAÄ)</a>'
            ]
        });
        layers.push(...RAAFornlamningarLayers);

        let RAAVarldsarvLayers = await this.loadWmsLayers("https://inspire-raa.metria.se/geoserver/Varldsarv/ows", "RAÄ", {
            attributions: [
                '© <a href="https://www.raa.se/" target="_blank">Riksantikvarieämbetet (RAÄ)</a>'
            ]
        });
        layers.push(...RAAVarldsarvLayers);

        let RAALamningarLayers = await this.loadWmsLayers("https://pub.raa.se/visning/lamningar_v1/wms", "RAÄ", {
            attributions: [
                '© <a href="https://www.raa.se/" target="_blank">Riksantikvarieämbetet (RAÄ)</a>'
            ]
        });
        layers.push(...RAALamningarLayers);

        /*
        var arcticDemLayer = new ImageLayer({
            source: new ImageArcGISRest({
                attributions: "<a target='_blank' href='https://www.pgc.umn.edu/data/arcticdem/'>NSF PGC ArcticDEM</a>",
                url: 'https://di-pgc.img.arcgis.com/arcgis/rest/services/arcticdem_rel2210/ImageServer',
                params: {
                    'format': 'jpgpng',
                    'renderingRule': JSON.stringify({
                        'rasterFunction': 'Hillshade Gray',
                        'rasterFunctionArguments': {
                            'ZFactor': 10.0
                        }
                    }),
                    'mosaicRule': JSON.stringify({
                        'where': 'acqdate1 IS NULL',
                        'ascending': false
                    })
                },
            }),
            visible: false
        });

        arcticDemLayer.setProperties({
            "layerId": "arcticDem",
            "title": "PGC ArcticDEM",
            "type": "baseLayer"
        });
        */

        return layers;
    }


    async loadWmsLayers(layerUrl, groupName, options = {}) {
        let olLayers = [];
        const defaultOptions = {
            filterLayers: null, // Function to filter layers, or array of layer names to keep
            serverType: 'geoserver',
            tiled: true,
            format: 'image/png',
            transparent: true,
            srs: 'EPSG:3857',
            attributions: [],
            //layerIdPrefix: groupName, // Optional prefix for layer IDs
            wmsParams: {}, // Additional WMS parameters
        };

        const config = { ...defaultOptions, ...options };

        let layersMetaData = await this.fetchWmsLayerInfo(layerUrl);

        let filteredLayers = layersMetaData;
        // Apply layer filtering
        if (config.filterLayers) {
            if (typeof config.filterLayers === 'function') {
                filteredLayers = layersMetaData.filter(config.filterLayers);
            } else if (Array.isArray(config.filterLayers)) {
                // Filter by layer names/IDs in the keep list
                filteredLayers = layersMetaData.filter(layer => 
                    config.filterLayers.includes(layer.name) || 
                    config.filterLayers.includes(layer.id)
                );
            }
        }
        
        filteredLayers.forEach(layerDef => {
            // Build WMS parameters
            const wmsParams = {
                'SERVICE': 'WMS',
                'VERSION': '1.3.0',
                'LAYERS': layerDef.name || layerDef.id,
                'TILED': config.tiled,
                'FORMAT': config.format,
                'TRANSPARENT': config.transparent,
                'SRS': config.srs,
                'STYLES': layerDef.defaultStyle || '',
                ...config.wmsParams // Allow override of any parameters
            };

            // Create the OpenLayers TileLayer
            let layer = new TileLayer({
                source: new TileWMS({
                    url: layerUrl,
                    params: wmsParams,
                    serverType: config.serverType,
                    attributions: config.attributions,
                    serverType: 'geoserver'
                }),
                visible: false
            });
            layer.setZIndex(10);

            //layerId should be a hashed combo of the layerUrl and the layerDef.id
            const layerId = this.getLayerId(`${layerUrl}_${layerDef.id}`);

                //check that no other previous layer has the same id, and if so, warn about it
            if (this.layers.some(l => l.get('layerId') === layerId) || olLayers.some(l => l.get('layerId') === layerId)) {
                console.warn(`Duplicate layer ID detected: ${layerId}.`);
            }

            let layerTitle = layerDef.title;
            
            //For these layers, add more info to the title based on the layerUrl since they are different layers with the same title
            if(layerTitle == "Anmälningsplikt" || layerTitle == "Byggnadsminne") {
                switch(layerUrl) {
                    case "https://pub.raa.se/visning/bebyggelse_kulturhistoriskt_inventerad_v1/wms":
                        layerTitle = layerTitle + " (kulturhistoriskt inventerad)";
                        break;
                    case "https://pub.raa.se/visning/enskilda_och_statliga_byggnadsminnen_skyddsomraden_v1/wms":
                        layerTitle = layerTitle + " (enskilda och statliga byggnadsminnen)";
                        break;
                }
            }

            // Set layer properties
            layer.setProperties({
                "layerId": layerId,
                "title": layerTitle,
                "clarifyingName": layerDef.name ? this.translateProperty(layerDef.name) : '',
                "type": "auxLayer",
                "legend": layerDef.legendUrl ? true : false,
                "legendUrl": layerDef.legendUrl,
                "group": groupName,
                "maxScaleDenominator": layerDef.maxScaleDenominator ? layerDef.maxScaleDenominator : undefined,
                "defaultStyle": layerDef.defaultStyle,
                "abstract": layerDef.abstract || '',
                "queryable": layerDef.queryable || false
            });

            olLayers.push(layer);
        });

        console.log(`Successfully loaded ${filteredLayers.length} ${groupName} layers`);
        return olLayers;
    }

    translateProperty(inputString) {
        if (!inputString || typeof inputString !== 'string') {
            return inputString;
        }

        // Iterate through all translation rules
        for (const translation of this.layerTranslations) {
            if (translation.search instanceof RegExp) {
                // Handle regex search patterns
                if (translation.search.test(inputString)) {
                    return inputString.replace(translation.search, translation.replace);
                }
            } else if (typeof translation.search === 'string') {
                // Handle exact string matches
                if (inputString === translation.search) {
                    return translation.replace;
                }
            }
        }

        // Return empty string if no translation found
        return '';
    }

    getLayerId(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash |= 0; // Convert to 32bit integer
        }
        return `layer_${Math.abs(hash)}`; // Ensure positive and prefix with 'layer_'
    }
}
import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Select from 'react-select';
import { FixedSizeGrid as Grid, areEqual } from 'react-window';
import useResizeObserver from '@react-hook/resize-observer';
import styled from 'styled-components';

import FontContainer, { FontPreview } from './FontContainer';
import sizeSortedFontVariants from './size_sorted_font_variants.json';

import { COLLECTION_GROUPS, LOCAL_FONTS_COLLECTION, MIN_COLUMN_WIDTH } from './constants';

function setDeepValue(object, value, ...keys) {
	keys.reduce((branch, key, i, { length }) => {
		if (i + 1 === length) {
			branch[key] = Math.max(branch[key] ?? 0, value);
		} else {
			branch[key] = branch[key] ?? {};
		}
		return branch[key];
	}, object);
}

const collectionOptions = COLLECTION_GROUPS.map(group => ({
	...group,
	options: Object.entries(group.options).map(([value, label]) => ({
		value,
		label,
	})),
}));

const Probe = styled.div`
	clip-path: inset(50%);
	clip: rect(0 0 0 0);
	display: flex;
	overflow: hidden;
	pointer-events: none;
	position: absolute;
	touch-action: none;
	white-space: nowrap;
	width: 1px;
`;

const StyledTextArea = styled.textarea`
	border: 1px solid hsl(0, 0%, 80%);
	border-radius: 4px;
`;

function useSize(target) {
	const [size, setSize] = useState({ width: 0, height: 0 });

	useLayoutEffect(() => {
		setSize(target.current.getBoundingClientRect());
	}, [target]);

	useResizeObserver(target, entry => setSize(entry.contentRect));
	return size;
}

function activeFontsFromCollections(includedCollections, excludedCollections, fonts) {
	const activeFonts = fonts.filter(
		font =>
			font.collections.some(collection => includedCollections.includes(collection)) &&
			!font.collections.some(collection => excludedCollections.includes(collection))
	);
	if (!activeFonts.length) return false;
	return activeFonts.reduce((acc, font) => {
		acc[font.name] = font;
		return acc;
	}, {});
}

const GridCell = React.memo(function GridCell({ columnIndex, rowIndex, style, data }) {
	const { columnCount, visibleFonts, ...props } = data;
	const font = visibleFonts[columnIndex + rowIndex * columnCount];
	return font ? <FontContainer font={font} style={style} {...props} /> : null;
}, areEqual);

function ExplorationMode({
	fontSize,
	setFontSize,
	lineHeight,
	setLineHeight,
	alignment,
	setAlignment,
	defaultPreviewContent,
	unsetDefaultPreview,
	previewContent,
	setPreviewContent,
	Preview,
	loadFont,
	setFonts,
	fonts,
	allFontsWithIndex,
}) {
	const [configMode, setConfigMode] = useState(true);
	const [fontWeight, setFontWeight] = useState(400);
	const [includedCollections, setIncludedCollections] = useState(() => [LOCAL_FONTS_COLLECTION]);
	const [excludedCollections, setExcludedCollections] = useState(() => []);
	const gridRef = useRef(null);
	const probeRef = useRef(null);
	const { height: probeHeight } = useSize(probeRef);
	const { width: gridWidth, height: gridHeight } = useSize(gridRef);
	const activeFonts = useMemo(
		() => activeFontsFromCollections(includedCollections, excludedCollections, allFontsWithIndex),
		[allFontsWithIndex, excludedCollections, includedCollections]
	);

	const columnCount = Math.max(Math.floor(gridWidth / MIN_COLUMN_WIDTH), 1);

	const [visibleFonts, bigFonts] = useMemo(() => {
		const [selectedFonts, unselectedFonts] = activeFonts
			? fonts
					.filter(font => activeFonts[font.name])
					.reduce(
						(acc, font) => {
							const [_selectedFonts, _unselectedFonts] = acc;
							(font.show ? _selectedFonts : _unselectedFonts).push(font);
							return acc;
						},
						[[], []]
					)
			: [[], []];
		const visibleFonts = configMode ? [...selectedFonts, ...unselectedFonts] : selectedFonts;
		const visibleFontNames = visibleFonts.reduce((acc, font) => {
			acc[font.name] = true;
			return acc;
		}, {});

		const bigFontMap = {};
		Object.values(sizeSortedFontVariants).forEach(sortedList => {
			for (const { name, href, variant } of sortedList) {
				if (visibleFontNames[name]) {
					setDeepValue(bigFontMap, 1, name, 'variants', variant.weight, variant.style, variant.stretch);
					if (href) bigFontMap[name].href = href;
					break;
				}
			}
		});
		visibleFonts
			.filter(font => font.sizeOffset > 1)
			.forEach(offsetFont => {
				Object.values(sizeSortedFontVariants).forEach(sortedList => {
					const { variant: biggestVariant } = sortedList.find(font => font.name === offsetFont.name);
					if (biggestVariant) {
						setDeepValue(
							bigFontMap,
							offsetFont.sizeOffset,
							offsetFont.name,
							'variants',
							biggestVariant.weight,
							biggestVariant.style,
							biggestVariant.stretch
						);
						if (offsetFont.href) bigFontMap[offsetFont.name].href = offsetFont.href;
					}
				});
			});

		const bigFonts = Object.entries(bigFontMap).flatMap(([name, { href, variants }]) =>
			Object.entries(variants).flatMap(([weight, _obj2]) =>
				Object.entries(_obj2).flatMap(([style, _obj3]) =>
					Object.entries(_obj3).map(([stretch, sizeOffset]) => ({
						font: { name, href, sizeOffset },
						variant: { weight, style, stretch },
					}))
				)
			)
		);

		return [visibleFonts, bigFonts];
	}, [activeFonts, configMode, fonts]);

	const onChangeShowToggle = useCallback(
		(checked, font) => {
			const { originalIndex } = font;
			setFonts(fonts => {
				const newFonts = [...fonts];
				newFonts[originalIndex] = {
					...fonts[originalIndex],
					show: checked,
					marked: checked && fonts[originalIndex].marked,
				};
				return newFonts;
			});
		},
		[setFonts]
	);

	const onChangeMarkedToggle = useCallback(
		(checked, font) => {
			const { originalIndex } = font;
			setFonts(fonts => {
				const newFonts = [...fonts];
				newFonts[originalIndex] = {
					...fonts[originalIndex],
					marked: checked,
				};
				return newFonts;
			});
		},
		[setFonts]
	);

	const onChangeSizeOffset = useCallback(
		(sizeOffset, font) => {
			const { originalIndex } = font;
			setFonts(fonts => {
				const newFonts = [...fonts];
				newFonts[originalIndex] = {
					...fonts[originalIndex],
					sizeOffset,
				};
				return newFonts;
			});
		},
		[setFonts]
	);

	const onChangeSelect = useCallback(
		(activeVariant, font) => {
			const { originalIndex } = font;
			setFonts(fonts => {
				const newFonts = [...fonts];
				newFonts[originalIndex] = {
					...fonts[originalIndex],
					activeVariant,
				};
				return newFonts;
			});
		},
		[setFonts]
	);

	const itemData = useMemo(
		() => ({
			columnCount,
			onChangeMarkedToggle,
			onChangeSelect,
			onChangeShowToggle,
			onChangeSizeOffset,
			Preview,
			loadFont,
			showSettings: configMode,
			visibleFonts,
		}),
		[
			columnCount,
			configMode,
			onChangeMarkedToggle,
			onChangeSelect,
			onChangeShowToggle,
			onChangeSizeOffset,
			Preview,
			loadFont,
			visibleFonts,
		]
	);

	return (
		<>
			<div className={`global-settings${configMode ? ' show-global-settings' : ''}`}>
				<input
					className="config-mode-toggle"
					type="checkbox"
					checked={configMode}
					onChange={e => setConfigMode(e.target.checked)}
					id="config-mode-toggle"
				/>
				<label htmlFor="config-mode-toggle"></label>
				<div className="global-settings-rows">
					<div className="global-settings-row">
						<label>
							Font size:
							<input type="number" min={1} value={fontSize} onChange={e => setFontSize(+e.target.value)} />
						</label>
						<label>
							Line height:
							<input
								type="number"
								min={0}
								step={0.05}
								value={lineHeight}
								onChange={e => setLineHeight(+e.target.value)}
							/>
						</label>
						<label>
							Nearest weight:
							<input
								className="global-font-weight-input"
								type="number"
								value={fontWeight}
								step={100}
								min={0}
								max={1000}
								onChange={e => {
									const targetWeight = +e.target.value;
									setFontWeight(targetWeight);
									setFonts(fonts =>
										fonts.map(font => {
											const activeStyle = font.variants[font.activeVariant].style;
											return {
												...font,
												activeVariant: font.variants
													.map((variant, index) => ({
														index,
														score: Math.abs(variant.weight - targetWeight) - (variant.style === activeStyle),
													}))
													.sort((a, b) => a.score - b.score)[0].index,
											};
										})
									);
								}}
							/>
						</label>
						<StyledTextArea
							rows={3}
							className="preview-text-input"
							value={previewContent ?? ''}
							placeholder={defaultPreviewContent}
							onChange={e => {
								setPreviewContent(e.target.value);
								unsetDefaultPreview();
							}}
						/>
						<fieldset className="alignment-options">
							Align:&nbsp;
							<input
								type="radio"
								value="left"
								checked={alignment === 'left'}
								onChange={e => {
									setAlignment(e.target.value);
								}}
							/>
							<input
								type="radio"
								value="center"
								checked={alignment === 'center'}
								onChange={e => {
									setAlignment(e.target.value);
								}}
							/>
							<input
								type="radio"
								value="right"
								checked={alignment === 'right'}
								onChange={e => {
									setAlignment(e.target.value);
								}}
							/>
						</fieldset>
					</div>
					<div className="global-settings-row">
						<Select
							className="collection-select"
							placeholder="Include collections…"
							isMulti={true}
							isSearchable={true}
							options={collectionOptions}
							defaultValue={collectionOptions
								.flatMap(group => group.options)
								.filter(option => option.value === LOCAL_FONTS_COLLECTION)}
							onChange={collections => {
								setIncludedCollections(collections.map(collection => collection.value));
							}}
						/>
						<Select
							className="collection-select"
							placeholder="Exclude collections…"
							isMulti={true}
							isSearchable={true}
							options={collectionOptions}
							onChange={collections => {
								setExcludedCollections(collections.map(collection => collection.value));
							}}
						/>
					</div>
				</div>
			</div>
			<Probe aria-hidden="true" ref={probeRef}>
				{bigFonts.map((font, i) => (
					<FontPreview
						key={i}
						font={font.font}
						variant={font.variant}
						Preview={Preview}
						loadFont={loadFont}
						style={{
							width: gridWidth / columnCount,
							flexShrink: 0,
							flexGrow: 0,
						}}
					/>
				))}
			</Probe>
			<div className="grid-container" ref={gridRef}>
				{activeFonts ? (
					visibleFonts.length ? (
						<Grid
							className="font-containers"
							columnCount={columnCount}
							columnWidth={gridWidth / columnCount}
							rowCount={Math.ceil(visibleFonts.length / columnCount)}
							rowHeight={probeHeight + 80}
							height={gridHeight}
							width={gridWidth}
							itemData={itemData}
						>
							{GridCell}
						</Grid>
					) : (
						<p className="no-fonts-warning">
							<strong>No fonts to display.</strong> Select one or more fonts in config mode.
						</p>
					)
				) : (
					<p className="no-fonts-warning">
						<strong>No fonts to display.</strong> Include more categories in config mode.
					</p>
				)}
			</div>
		</>
	);
}

export default ExplorationMode;

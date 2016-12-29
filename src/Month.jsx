import React from 'react';
import { findDOMNode } from 'react-dom';
import cn from 'classnames';
import dates from './utils/dates';
import localizer from './localizer'
import chunk from 'lodash/array/chunk';

import { navigate } from './utils/constants';
import { notify } from './utils/helpers';
import getHeight from 'dom-helpers/query/height';
import getPosition from 'dom-helpers/query/position';
import raf from 'dom-helpers/util/requestAnimationFrame';

import EventRow from './MonthEventRow';
import EventEndingRow from './MonthEventEndingRow';
import Popup from './Popup';
import Overlay from 'react-overlays/lib/Overlay';
import BackgroundCells from './MonthBackgroundCells';
import Header from './Header';

import { dateFormat } from './utils/propTypes';
import {
    segStyle, inRange, eventSegments
  , endOfRange, eventLevels, sortEvents } from './utils/eventLevels';

let eventsForWeek = (evts, start, end, props) =>
  evts.filter(e => inRange(e, start, end, props));

let isSegmentInSlot = (seg, slot) => seg.left <= slot && seg.right >= slot;

let propTypes = {
  ...EventRow.PropTypes,

  culture: React.PropTypes.string,

  date: React.PropTypes.instanceOf(Date),

  min: React.PropTypes.instanceOf(Date),
  max: React.PropTypes.instanceOf(Date),

  dateFormat,

  weekdayFormat: dateFormat,

  popup: React.PropTypes.bool,

  manualLayout: React.PropTypes.bool,

  popupOffset: React.PropTypes.oneOfType([
    React.PropTypes.number,
    React.PropTypes.shape({
      x: React.PropTypes.number,
      y: React.PropTypes.number
    })
  ]),

  onSelectEvent: React.PropTypes.func,
  onSelectSlot: React.PropTypes.func,
  backgroundPropGetter: React.PropTypes.func,
};

let MonthView = React.createClass({

  displayName: 'MonthView',

  propTypes,

  getInitialState(){
    return {
      rowLimit: 5,
      needLimitMeasure: true,
      viewHeight: 300,
      headerHeight: 20,
    }
  },

  componentWillMount() {
    this._bgRows = []
    this._pendingSelection = []
  },

  componentWillReceiveProps({ date }) {
    this.setState({
      needLimitMeasure: !dates.eq(date, this.props.date)
    })
  },

  componentDidMount() {
    let running;

    if (this.state.needLimitMeasure)
      this._measureRowLimit(this.props)

    window.addEventListener('resize', this._resizeListener = ()=> {
      if (!running) {
        raf(()=> {
          running = false
          this.setState({ needLimitMeasure: true }) //eslint-disable-line
        })
      }
    }, false)
  },

  componentDidUpdate() {
    if (this.state.needLimitMeasure)
      this._measureRowLimit(this.props)
  },

  componentWillUnmount() {
    window.removeEventListener('resize', this._resizeListener, false)
  },

  render() {
    let { date, culture, weekdayFormat, className } = this.props
      , month = dates.visibleDays(date, culture)
      , weeks  = chunk(month, 7);

    let measure = this.state.needLimitMeasure

    this._weekCount = weeks.length;

    return (
      <div className={cn('rbc-month-view', className)} ref={r => this._view = r}>
        <div className='rbc-row rbc-month-header' ref={r => this._header = r}>
          {this._headers(weeks[0], weekdayFormat, culture)}
        </div>
        { weeks.map((week, idx) =>
            this.renderWeek(week, idx, measure && this._renderMeasureRows))
        }
        { this.props.popup &&
            this._renderOverlay()
        }
      </div>
    )
  },

  renderWeek(week, weekIdx, content) {
    let { viewHeight, headerHeight } = this.state;
    let { first, last } = endOfRange(week);
    let evts = eventsForWeek(this.props.events, week[0], week[week.length - 1], this.props);

    evts.sort((a, b) => sortEvents(a, b, this.props));

    let segments = evts = evts.map(evt => eventSegments(evt, first, last, this.props));
    let limit = (this.state.rowLimit - 1) || 1;
    if (this.props.manualLayout) {
      limit = Infinity;
    }

    let { levels, extra } = eventLevels(segments, limit);

    content = content || ((lvls, wk) => lvls.map((lvl, idx) => this.renderRowLevel(lvl, wk, idx)));

    let weekHeight = Math.abs((viewHeight - headerHeight) / this._weekCount);

    return (
      <div key={'week_' + weekIdx}
        className='rbc-month-row'
        ref={!weekIdx && (r => this._firstRow = r)}
        style={{ height: weekHeight }} // TODO: measure depending on container height
      >
        {
          this.renderBackground(week, weekIdx)
        }
        <div
          className='rbc-row-content'
        >
          <table>
            <thead>
              <tr
                className='rbc-row'
                ref={!weekIdx && (r => this._firstDateRow = r)}
              >
                { this._dates(week) }
              </tr>  
            </thead>
            <tbody>
                {
                    content(levels, week, weekIdx)
                }
                {
                    !!extra.length &&
                    this.renderShowMore(segments, extra, week, weekIdx, levels.length)
                }
            </tbody>
          </table>
        </div>
      </div>
    )
  },

  renderBackground(row, idx){
    let self = this;
    let { backgroundPropGetter } = this.props;

    function onSelectSlot({ start, end }, ev) {
      self._pendingSelection = self._pendingSelection
        .concat(row.slice(start, end + 1))

      clearTimeout(self._selectTimer)
      self._selectTimer = setTimeout(()=> self._selectDates(ev))
    }

    return (
      <div className='rbc-row-bg'>
        <table>
            <tbody>
              <BackgroundCells
                rtl={this.props.rtl}
                slots={row}
                onSelectSlot={onSelectSlot}
                container={() => findDOMNode(this)}
                selectable={this.props.selectable}
                ref={r => this._bgRows[idx] = r}
                backgroundPropGetter={backgroundPropGetter}
              />
            </tbody>
        </table>
      </div>
    )
  },

  renderRowLevel(segments, week, idx){
    let { first, last } = endOfRange(week);

    return (
      <EventRow
        {...this.props}
        eventComponent={this.props.components.event}
        onSelect={this.handleSelectEvent}
        key={idx}
        segments={segments}
        start={first}
        end={last}
      />
    )
  },

  renderShowMore(segments, extraSegments, week, weekIdx) {
    let { first, last } = endOfRange(week);

    let onClick = slot => this._showMore(segments, week[slot - 1], weekIdx, slot)

    return (
      <EventEndingRow
        {...this.props}
        eventComponent={this.props.components.event}
        onSelect={this.handleSelectEvent}
        onShowMore={onClick}
        key={'last_row_' + weekIdx}
        segments={extraSegments}
        start={first}
        end={last}
      />
    )
  },

  _dates(row) {
    return row.map((day, colIdx) => {
      var offRange = dates.month(day) !== dates.month(this.props.date);

      return (
        <td
          key={'header_' + colIdx}
          className={cn('rbc-date-cell', {
            'rbc-off-range': offRange,
            'rbc-now': dates.eq(day, new Date(), 'day'),
            'rbc-current': dates.eq(day, this.props.date, 'day')
          })}
        >
          <a href='#' onClick={this._dateClick.bind(null, day)}>
            { localizer.format(day, this.props.dateFormat, this.props.culture) }
          </a>
        </td>
      )
    })
  },

  _headers(row, format, culture) {
    let first = row[0];
    let last = row[row.length - 1];
    let HeaderComponent = this.props.components.header || Header;
    let children = dates.range(first, last, 'day').map((day, idx) =>
      <th
        key={'header_' + idx}
        className='rbc-header'
      >
        <HeaderComponent
          date={day}
          label={localizer.format(day, format, culture)}
          localizer={localizer}
          format={format}
          culture={culture} />
      </th>
    );

    return (
        <table>
            <thead>
                <tr>
                    {children}
                </tr>
            </thead>
        </table>
    );
  },

  _renderMeasureRows(levels, row, idx) {
    let first = idx === 0;

    return first ? (
      <tr className="rbc-row">
        <td className='rbc-row-segment'>
          <div ref={r => this._measureEvent = r} className={cn('rbc-event')}>
            <div className='rbc-event-content'>&nbsp;</div>
          </div>
        </td>
      </tr>
    ) : <tr/>
  },

  _renderOverlay() {
    let overlay = (this.state && this.state.overlay) || {};
    let { components } = this.props;

    return (
      <Overlay
        rootClose
        placement='bottom'
        container={this}
        show={!!overlay.position}
        onHide={() => this.setState({ overlay: null })}
      >
        <Popup
          {...this.props}
          eventComponent={components.event}
          position={overlay.position}
          events={overlay.events}
          slotStart={overlay.date}
          slotEnd={overlay.end}
          onSelect={this.handleSelectEvent}
        />
      </Overlay>
    )
  },

  _measureRowLimit() {
    let viewHeight = getHeight(this._view);
    let headerHeight = getHeight(this._header);
    let eventHeight = getHeight(this._measureEvent);
    let labelHeight = getHeight(this._firstDateRow);
    let eventSpace = getHeight(this._firstRow) - labelHeight;

    this._needLimitMeasure = false;

    this.setState({
      needLimitMeasure: false,
      viewHeight: viewHeight,
      headerHeight: headerHeight,
      rowLimit: Math.max(
        Math.floor(eventSpace / eventHeight), 1)
    })
  },

  _dateClick(date, e){
    e.preventDefault();
    this.clearSelection()
    notify(this.props.onNavigate, [navigate.DATE, date])
  },

  handleSelectEvent(...args){
    //cancel any pending selections so only the event click goes through.
    this.clearSelection()

    notify(this.props.onSelectEvent, args)
  },

  _selectDates(ev) {
    let slots = this._pendingSelection.slice()

    this._pendingSelection = []

    slots.sort((a, b) => +a - +b)

    notify(this.props.onSelectSlot, [{
      slots,
      start: slots[0],
      end: slots[slots.length - 1]
    }, ev])
  },

  _showMore(segments, date, weekIdx, slot) {
    let cell = findDOMNode(this._bgRows[weekIdx]).children[slot - 1];

    let events = segments
      .filter(seg => isSegmentInSlot(seg, slot))
      .map(seg => seg.event)

    //cancel any pending selections so only the event click goes through.
    this.clearSelection()

    if (this.props.popup) {
      let position = getPosition(cell, findDOMNode(this));

      this.setState({
        overlay: { date, events, position }
      })
    }
    else {
      notify(this.props.onNavigate, [navigate.DATE, date])
    }

    notify(this.props.onShowMore, [events, date, slot])
  },

  clearSelection(){
    clearTimeout(this._selectTimer)
    this._pendingSelection = [];
  }

});

MonthView.navigate = (date, action)=> {
  switch (action){
    case navigate.PREVIOUS:
      return dates.add(date, -1, 'month');

    case navigate.NEXT:
      return dates.add(date, 1, 'month')

    default:
      return date;
  }
}

MonthView.range = (date, { culture }) => {
  let start = dates.firstVisibleDay(date, culture)
  let end = dates.lastVisibleDay(date, culture)
  return { start, end }
}

export default MonthView

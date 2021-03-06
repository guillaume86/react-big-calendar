import React from 'react';
import EventRowMixin from './MonthEventRowMixin';


let EventRow = React.createClass({

  displayName: 'EventRow',

  propTypes: {
    segments: React.PropTypes.array
  },

  mixins: [EventRowMixin],

  render(){
    let { segments } = this.props;

    let lastEnd = 1;

    //console.log({ segments });

    return (
      <tr className='rbc-row'>
      {
        segments.reduce((row, { event, left, right, span }, li) => {
          let key = '_lvl_' + li;
          let gap = left - lastEnd;

          let content = this.renderEvent(event)

          if (gap)
            row.push(this.renderSpan(gap, key + '_gap'))

          row.push(
            this.renderSpan(span, key, content)
          )

          lastEnd = (right + 1);

          return row;
        }, [])
      }
      </tr>
    )
  }
});

export default EventRow
